import { readFileSync } from 'node:fs'
import type { BucketKeyer } from '../../domain/auth/ports.js'
import { DomainError } from '../../shared/errors.js'
import { buildSeedManifest } from '../../usecases/seed/manifest.js'
import { runSmoke, type SmokeClient } from '../../usecases/seed/smoke.js'
import { createFetchSmokeClient } from './smokeClient.js'
import type { SeedEraser, SeedInspector } from '../../usecases/seed/ports.js'
import { inspectSeed, SeedPreflightError } from '../../usecases/seed/preflight.js'
import { runReset } from '../../usecases/seed/resetFixtures.js'
import { assertDatabaseIdentity, assertResetAllowed, assertSeedAllowed, type DatabaseTarget } from '../../usecases/seed/resetGuard.js'
import { SEED_CREDENTIAL_ENV, SeedCredentialsError, runSeed, type SeedCredentials, type SeedDeps } from '../../usecases/seed/runSeed.js'

/** Mensaje de uso: lista cerrada de opciones; no existe forma de elegir entorno, host ni base. */
export const USAGE = [
  'Uso: seed-cli <manifest | seed [--dry-run] | smoke | reset [--execute --confirm=<token>] [--include-store]>',
  '  manifest        versión del dataset y fixtures (sin base de datos)',
  '  seed            preflight y siembra idempotente en la base de test declarada',
  '  seed --dry-run  solo el preflight: no escribe',
  '  smoke           comprobación de solo lectura de una API de test desplegada (SMOKE_BASE_URL)',
  '  reset           dry-run del reset de fixtures: mide y devuelve el token de confirmación',
  '  reset --execute --confirm=<token>  borra los fixtures medidos si el estado no cambió',
].join('\n')

export class CliUsageError extends DomainError {
  constructor(message: string) {
    super(message, 'CLI_USAGE')
    this.name = 'CliUsageError'
  }
}

export type ParsedCommand =
  | { command: 'manifest' }
  | { command: 'seed'; dryRun: boolean }
  | { command: 'smoke' }
  | { command: 'reset'; execute: boolean; confirm: string | undefined; includeStore: boolean }

const takeFlags = (args: readonly string[], allowed: readonly string[]): Map<string, string | true> => {
  const flags = new Map<string, string | true>()
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index] as string
    const [name, ...value] = raw.split('=')
    if (!name || !allowed.includes(name)) throw new CliUsageError(`Opción no permitida: ${name?.split('=')[0] ?? ''}`)
    if (flags.has(name)) throw new CliUsageError(`Opción repetida: ${name}`)
    if (name === '--confirm') {
      const token = value.length > 0 ? value.join('=') : args[(index += 1)]
      if (!token || token.startsWith('--')) throw new CliUsageError('--confirm requiere el token del dry-run')
      flags.set(name, token)
    } else {
      if (value.length > 0) throw new CliUsageError(`La opción ${name} no admite valor`)
      flags.set(name, true)
    }
  }
  return flags
}

export const parseArgs = (argv: readonly string[]): ParsedCommand => {
  const [command, ...rest] = argv
  if (command === 'manifest' || command === 'smoke') {
    takeFlags(rest, [])
    return { command }
  }
  if (command === 'seed') {
    return { command, dryRun: takeFlags(rest, ['--dry-run']).has('--dry-run') }
  }
  if (command === 'reset') {
    const flags = takeFlags(rest, ['--execute', '--confirm', '--include-store'])
    const confirm = flags.get('--confirm')
    const execute = flags.has('--execute')
    if (execute && confirm === undefined) throw new CliUsageError('--execute requiere --confirm=<token> de un dry-run previo')
    if (!execute && confirm !== undefined) throw new CliUsageError('--confirm solo se usa junto con --execute')
    return { command, execute, confirm: typeof confirm === 'string' ? confirm : undefined, includeStore: flags.has('--include-store') }
  }
  throw new CliUsageError('Comando desconocido')
}

export interface SeedRuntime {
  deps: SeedDeps
  eraser: SeedEraser
  inspector: SeedInspector
  keys: BucketKeyer
  /** Cierra recursos (los tests con base embebida); el runtime real no mantiene conexiones. */
  close?(): Promise<void>
}

export interface CliIo {
  out(line: string): void
  err(line: string): void
}

export interface CliOptions {
  /** Migraciones esperadas en el ledger; por defecto las del journal del repositorio. */
  expectedMigrations?: number
  /** Crea el runtime tras pasar los guards; el real importa el cliente Neon recién entonces. */
  connect?: (env: NodeJS.ProcessEnv) => Promise<SeedRuntime>
  /** Cliente HTTP del smoke; el real usa `fetch` contra `SMOKE_BASE_URL`. */
  smokeClient?: SmokeClient
}

const journalEntries = (): number => {
  const journal = JSON.parse(readFileSync(new URL('../postgres/migrations/meta/_journal.json', import.meta.url), 'utf8')) as { entries: unknown[] }
  return journal.entries.length
}

/** Conexión real: la configuración validada y el cliente de `DATABASE_URL`, sin overrides. */
const connectFromEnvironment = async (): Promise<SeedRuntime> => {
  const { getRepositories } = await import('../factory.js')
  const { getAuthRuntime } = await import('../auth/factory.js')
  const { db } = await import('../postgres/client.js')
  const { SeedStorePostgres } = await import('../postgres/SeedStorePostgres.js')
  const repositories = await getRepositories()
  const { deps } = await getAuthRuntime()
  const store = new SeedStorePostgres(db)
  return {
    inspector: store,
    eraser: store,
    keys: deps.keys,
    deps: { inspector: store, repositories, auth: deps },
  }
}

const credentialsFrom = (env: NodeJS.ProcessEnv): SeedCredentials => {
  const read = (name: string): string | undefined => (env[name] === undefined || env[name] === '' ? undefined : env[name])
  const owner = read(SEED_CREDENTIAL_ENV.owner)
  const operator = read(SEED_CREDENTIAL_ENV.operator)
  const customer = read(SEED_CREDENTIAL_ENV.customer)
  return { ...(owner ? { owner } : {}), ...(operator ? { operator } : {}), ...(customer ? { customer } : {}) }
}

const summary = (preflight: Awaited<ReturnType<typeof inspectSeed>>) => ({
  conflicts: preflight.conflicts,
  schema: preflight.schema,
  plan: {
    store: preflight.plan.store,
    categoriesToCreate: preflight.plan.categoriesToCreate.length,
    productsToCreate: preflight.plan.productsToCreate.length,
    accountsToCreate: preflight.plan.accountsToCreate,
    ordersToCreate: preflight.plan.ordersToCreate,
    ordersPresent: preflight.plan.ordersPresent,
  },
})

/** El ledger de Drizzle debe tener todas las migraciones del journal: el seed corre DESPUÉS de migrar. */
const assertMigrated = (ledgerEntries: number | null, expected: number): void => {
  if (ledgerEntries !== expected) {
    throw new DomainError(`Ledger de migraciones ${ledgerEntries === null ? 'ausente' : `con ${ledgerEntries}`} de ${expected}: migrar antes del seed`, 'MIGRATIONS_NOT_APPLIED')
  }
}

const publicTarget = (target: DatabaseTarget) => ({ host: target.host, database: target.database })

/**
 * Ejecuta un comando y devuelve el código de salida. Orden fijo: argumentos → guard de entorno →
 * conexión → identidad de la base → preflight → acción. La salida es JSON sin credenciales ni URLs;
 * un error inesperado no imprime su mensaje (podría llevar SQL o la cadena de conexión).
 */
export const runCli = async (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
  options: CliOptions = {},
): Promise<number> => {
  let runtime: SeedRuntime | undefined
  try {
    const parsed = parseArgs(argv)
    if (parsed.command === 'manifest') {
      io.out(JSON.stringify(buildSeedManifest(), null, 2))
      return 0
    }
    if (parsed.command === 'smoke') {
      const passwords = credentialsFrom(env)
      if (!passwords.owner || !passwords.operator || !passwords.customer) {
        throw new SeedCredentialsError(Object.values(SEED_CREDENTIAL_ENV).filter(name => !env[name]))
      }
      const report = await runSmoke(options.smokeClient ?? createFetchSmokeClient(env), { owner: passwords.owner, operator: passwords.operator, customer: passwords.customer })
      io.out(JSON.stringify(report, null, 2))
      return report.ok ? 0 : 1
    }
    const target = parsed.command === 'reset' ? assertResetAllowed(env) : assertSeedAllowed(env)
    const expectedMigrations = options.expectedMigrations ?? journalEntries()
    runtime = await (options.connect ?? connectFromEnvironment)(env)

    if (parsed.command === 'seed') {
      assertDatabaseIdentity(target, await runtime.inspector.databaseName())
      const preflight = await inspectSeed(runtime.inspector)
      if (preflight.conflicts.length === 0) assertMigrated(preflight.schema.ledgerEntries, expectedMigrations)
      if (parsed.dryRun) {
        io.out(JSON.stringify({ mode: 'dry-run', datasetVersion: preflight.datasetVersion, contentHash: preflight.contentHash, target: publicTarget(target), ...summary(preflight) }, null, 2))
        return preflight.conflicts.length === 0 ? 0 : 1
      }
      const { report } = await runSeed(runtime.deps, credentialsFrom(env))
      io.out(JSON.stringify({ mode: 'seed', target: publicTarget(target), report }, null, 2))
      return 0
    }

    const schema = await runtime.inspector.schemaStatus()
    assertMigrated(schema.ledgerEntries, expectedMigrations)
    const result = await runReset(
      { inspector: runtime.inspector, eraser: runtime.eraser, keys: runtime.keys, target },
      { execute: parsed.execute, confirm: parsed.confirm, includeStore: parsed.includeStore },
    )
    io.out(JSON.stringify(result, null, 2))
    return 0
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.err(`${error.message}\n${USAGE}`)
      return 2
    }
    if (error instanceof SeedPreflightError) {
      io.err(JSON.stringify({ error: error.code, conflicts: error.conflicts }, null, 2))
      return 1
    }
    if (error instanceof DomainError) {
      io.err(JSON.stringify({ error: error.code, message: error.message }))
      return 1
    }
    io.err(JSON.stringify({ error: 'SEED_FAILED', message: 'Fallo inesperado; revisar configuración y disponibilidad de la base' }))
    return 1
  } finally {
    await runtime?.close?.()
  }
}
