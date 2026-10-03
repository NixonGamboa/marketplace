import { readFile, writeFile } from 'node:fs/promises'
import { RecoveryPostgres } from './postgres.js'
import { openBackup, sealBackup, fingerprint, RecoveryError } from './format.js'
import { assertSource, assertRestoreTarget, confirmationFor, restorePlanSchema, verifyConfirmation, type RestorePlan } from './guard.js'
import { toPublicCatalogResponse } from '../../domain/catalog/catalogMappers.js'

const args = (argv: string[]): { command: string; options: Record<string, string> } => {
  const [command, ...flags] = argv
  if (!command || !['backup', 'restore', 'export-catalog'].includes(command)) throw new RecoveryError('CLI_USAGE')
  const options: Record<string, string> = {}
  for (const flag of flags) {
    const match = /^--(file|guard|plan|confirm|execute)=(.+)$/.exec(flag)
    if (!match || !match[1] || !match[2] || Object.hasOwn(options, match[1])) throw new RecoveryError('CLI_USAGE')
    options[match[1]] = match[2]
  }
  const allowed = command === 'restore' ? ['file', 'guard', 'plan', 'confirm', 'execute'] : ['file']
  if (!options.file || Object.keys(options).some(key => !allowed.includes(key)) || (options.execute && options.execute !== 'true')
    || (command === 'restore' && (!options.guard || !options.plan || Boolean(options.execute) !== Boolean(options.confirm)))) throw new RecoveryError('CLI_USAGE')
  return { command, options }
}
const privateWrite = (path: string, content: string): Promise<void> => writeFile(path, content, { mode: 0o600, flag: 'wx' })
const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'))

export const runRecovery = async (argv: string[], env: NodeJS.ProcessEnv): Promise<Record<string, unknown>> => {
  const { command, options } = args(argv)
  const file = options.file!
  if (command !== 'restore') {
    const target = assertSource(env)
    const database = new RecoveryPostgres(target.url)
    if (command === 'export-catalog') {
      // Usa el contrato público del catálogo, excluyendo cuentas, tienda privada y metadata interna.
      const { drizzle } = await import('drizzle-orm/neon-http')
      const { neon } = await import('@neondatabase/serverless')
      const { CatalogRepositoryPostgres } = await import('../postgres/CatalogRepositoryPostgres.js')
      const { getPublicCatalog } = await import('../../usecases/catalog/readCatalog.js')
      const catalog = toPublicCatalogResponse(await getPublicCatalog({ catalog: new CatalogRepositoryPostgres(drizzle(neon(target.url))) }, 'leche-y-miel'))
      await privateWrite(file, JSON.stringify(catalog, null, 2))
      return { command, exported: true, contentHash: fingerprint(catalog) }
    }
    const key = env.BACKUP_ENCRYPTION_KEY ?? ''
    if (!/^[a-f0-9]{64}$/i.test(key) || key === env.AUTH_JWT_SECRET || key === env.JWT_SECRET) throw new RecoveryError('INVALID_BACKUP_KEY')
    const snapshot = await database.snapshot()
    await privateWrite(file, sealBackup(snapshot, key))
    return { command, encrypted: true, contentHash: fingerprint(snapshot), counts: Object.fromEntries(Object.entries(snapshot.tables).map(([name, rows]) => [name, rows.length])) }
  }
  const { target, provenance } = assertRestoreTarget(env, await readJson(options.guard!))
  const backup = openBackup(await readFile(file, 'utf8'), env.BACKUP_ENCRYPTION_KEY ?? '')
  const database = new RecoveryPostgres(target.url)
  const before = await database.snapshot()
  if (fingerprint(before.schema) !== fingerprint(backup.snapshot.schema) || fingerprint(before.ledger) !== fingerprint(backup.snapshot.ledger)) throw new RecoveryError('INCOMPATIBLE_SCHEMA')
  const now = new Date()
  const current: RestorePlan = { version: 1, branchId: provenance.branchId, host: target.host, backupHash: backup.contentHash, beforeHash: fingerprint(before), provenanceHash: fingerprint(provenance), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString() }
  if (!options.execute) {
    await privateWrite(options.plan!, JSON.stringify(current))
    return { command, dryRun: true, confirmationSha: confirmationFor(current), expiresAt: current.expiresAt, backupHash: current.backupHash, beforeHash: current.beforeHash }
  }
  const plan = restorePlanSchema.parse(await readJson(options.plan!))
  verifyConfirmation(plan, current, options.confirm!)
  assertRestoreTarget(env, provenance)
  await database.restore(backup.snapshot, before)
  const after = await database.snapshot()
  if (fingerprint(after) !== backup.contentHash) throw new RecoveryError('RESTORE_VERIFICATION_FAILED')
  return { command, restored: true, contentHash: fingerprint(after) }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/recovery/main.ts')) {
  runRecovery(process.argv.slice(2), process.env).then(result => console.info(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({ error: error instanceof RecoveryError ? error.code : 'RECOVERY_FAILED' }))
    process.exitCode = 1
  })
}
