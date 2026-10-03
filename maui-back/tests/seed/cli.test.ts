import { describe, expect, it, vi } from 'vitest'
import { CliUsageError, parseArgs, runCli, type CliIo, type SeedRuntime } from '../../src/infra/seed/cli.js'
import { SeedStorePostgres } from '../../src/infra/postgres/SeedStorePostgres.js'
import { SEED_ORDERS } from '../../src/usecases/seed/dataset.js'
import { countRows, startSeedWorld, testCredentials, type SeedWorld } from './seedFixture.js'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const TEST_HOST = 'ep-tiny-feather-aug4p4jh.c-10.us-east-1.aws.neon.tech'
const CONNECTION = `postgresql://usuario:contrasena-de-conexion-privada@${TEST_HOST}/maui?sslmode=require`

/** Reporta la base declarada (`maui`): PGlite siempre informa `postgres`. */
class DeclaredDatabaseStore extends SeedStorePostgres {
  override databaseName(): Promise<string> {
    return Promise.resolve('maui')
  }
}

const runtimeFor = (world: SeedWorld): SeedRuntime => {
  const store = new DeclaredDatabaseStore(world.embedded.db)
  return { inspector: store, eraser: store, keys: world.keys, deps: { ...world.deps, inspector: store } }
}

const envFor = (overrides: Record<string, string | undefined> = {}, passwords = testCredentials()): NodeJS.ProcessEnv => ({
  APP_ENV: 'test',
  NODE_ENV: 'production',
  DB_DRIVER: 'postgres',
  DATABASE_URL: CONNECTION,
  TEST_DATABASE_HOST: TEST_HOST,
  TEST_DATABASE_NAME: 'maui',
  PRODUCTION_DATABASE_HOST: 'ep-prod-branch-456.us-east-2.aws.neon.tech',
  PRODUCTION_DATABASE_NAME: 'maui',
  RESET_TARGET: 'dev/maui',
  SEED_OWNER_PASSWORD: passwords.owner,
  SEED_OPERATOR_PASSWORD: passwords.operator,
  SEED_CUSTOMER_PASSWORD: passwords.customer,
  ...overrides,
})

const capture = () => {
  const lines: { stream: 'out' | 'err'; line: string }[] = []
  const io: CliIo = { out: line => lines.push({ stream: 'out', line }), err: line => lines.push({ stream: 'err', line }) }
  return { io, text: () => lines.map(entry => entry.line).join('\n'), out: () => lines.filter(entry => entry.stream === 'out').map(entry => entry.line).join('\n') }
}

async function createLedger(world: SeedWorld, entries: number): Promise<void> {
  await world.embedded.pg.exec('create schema if not exists drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)')
  for (let index = 0; index < entries; index += 1) {
    await world.embedded.pg.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [`hash-${index}`, index])
  }
}

describe('argumentos del CLI', () => {
  it.each([
    [['manifest'], { command: 'manifest' }],
    [['seed'], { command: 'seed', dryRun: false }],
    [['seed', '--dry-run'], { command: 'seed', dryRun: true }],
    [['reset'], { command: 'reset', execute: false, confirm: undefined, includeStore: false }],
    [['reset', '--include-store'], { command: 'reset', execute: false, confirm: undefined, includeStore: true }],
    [['reset', '--execute', '--confirm=reset-abc'], { command: 'reset', execute: true, confirm: 'reset-abc', includeStore: false }],
    [['reset', '--execute', '--confirm', 'reset-abc'], { command: 'reset', execute: true, confirm: 'reset-abc', includeStore: false }],
  ])('acepta %j', (argv, expected) => {
    expect(parseArgs(argv)).toEqual(expected)
  })

  it.each([
    [[]],
    [['borrar-todo']],
    [['seed', '--database-url=postgresql://otro/otra']],
    [['seed', '--env=production']],
    [['reset', '--host=otro.example.com']],
    [['reset', '--database=otra']],
    [['reset', '--force']],
    [['reset', '--execute']],
    [['reset', '--confirm=reset-abc']],
    [['reset', '--execute', '--confirm']],
    [['reset', '--execute', '--confirm=a', '--confirm=b']],
    [['reset', '--dry-run=no']],
    [['seed', '--execute']],
    [['manifest', '--dry-run']],
  ])('rechaza %j', argv => {
    expect(() => parseArgs(argv)).toThrow(CliUsageError)
  })
})

describe('runCli', () => {
  it('manifest imprime versión y fixtures sin tocar la base ni el entorno', async () => {
    const connect = vi.fn()
    const output = capture()
    expect(await runCli(['manifest'], {}, output.io, { connect })).toBe(0)
    const manifest = JSON.parse(output.out()) as { datasetVersion: string; contentHash: string; counts: { orders: number } }
    expect(manifest).toMatchObject({ datasetVersion: 'test-seed-v1', counts: { orders: SEED_ORDERS.length } })
    expect(manifest.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(connect).not.toHaveBeenCalled()
  })

  it('un guard rechazado sale con código 1 sin abrir conexión y sin imprimir secretos', async () => {
    const connect = vi.fn()
    for (const [argv, env] of [
      [['seed'], envFor({ APP_ENV: 'production' })],
      [['seed'], envFor({ DB_DRIVER: 'memory' })],
      [['reset'], envFor({ APP_ENV: 'local' })],
      [['reset'], envFor({ RESET_TARGET: undefined })],
      [['reset'], envFor({ PGHOST: 'otro' })],
      [['reset'], envFor({ TEST_DATABASE_HOST: 'otro.example', DATABASE_URL: 'postgresql://u:p@otro.example/maui' })],
    ] as const) {
      const output = capture()
      expect(await runCli(argv, env, output.io, { connect })).toBe(1)
      expect(output.text()).toContain('SEED_GUARD_REJECTED')
      expect(output.text()).not.toContain('contrasena-de-conexion-privada')
    }
    expect(connect).not.toHaveBeenCalled()
  })

  it('un uso inválido sale con código 2 y nunca se conecta', async () => {
    const connect = vi.fn()
    const output = capture()
    expect(await runCli(['reset', '--execute'], envFor(), output.io, { connect })).toBe(2)
    expect(connect).not.toHaveBeenCalled()
  })

  it('seed exige que el ledger de migraciones esté completo antes de escribir', async () => {
    const world = await startSeedWorld()
    try {
      for (const entries of [null, 7]) {
        if (entries !== null) await createLedger(world, entries)
        const output = capture()
        expect(await runCli(['seed'], envFor(), output.io, { connect: async () => runtimeFor(world) })).toBe(1)
        expect(output.text()).toContain('MIGRATIONS_NOT_APPLIED')
        expect(await countRows(world, 'stores')).toBe(0)
        if (entries !== null) await world.embedded.pg.exec('drop schema drizzle cascade')
      }
    } finally {
      await world.close()
    }
  })

  it('seed --dry-run no escribe; seed siembra, es idempotente y no imprime credenciales ni la conexión', async () => {
    const world = await startSeedWorld()
    const passwords = testCredentials()
    try {
      await createLedger(world, 8)
      const connect = async () => runtimeFor(world)

      const dry = capture()
      expect(await runCli(['seed', '--dry-run'], envFor({}, passwords), dry.io, { connect })).toBe(0)
      expect(JSON.parse(dry.out())).toMatchObject({ mode: 'dry-run', datasetVersion: 'test-seed-v1', conflicts: [], target: { host: TEST_HOST, database: 'maui' } })
      expect(await countRows(world, 'stores')).toBe(0)

      const first = capture()
      expect(await runCli(['seed'], envFor({}, passwords), first.io, { connect })).toBe(0)
      expect((JSON.parse(first.out()) as { report: { orders: { outcome: string }[] } }).report.orders.every(order => order.outcome === 'created')).toBe(true)
      expect(await countRows(world, 'orders')).toBe(SEED_ORDERS.length)

      const second = capture()
      expect(await runCli(['seed'], envFor({}, passwords), second.io, { connect })).toBe(0)
      expect((JSON.parse(second.out()) as { report: { orders: { outcome: string }[] } }).report.orders.every(order => order.outcome === 'unchanged')).toBe(true)

      for (const output of [dry, first, second]) {
        for (const secret of [...Object.values(passwords), 'contrasena-de-conexion-privada']) expect(output.text()).not.toContain(secret)
        expect(output.text()).not.toMatch(/postgres(ql)?:\/\/|password_hash|scrypt/i)
      }
    } finally {
      await world.close()
    }
  })

  it('seed sin contraseñas para cuentas nuevas falla sin escribir y nombra solo las variables', async () => {
    const world = await startSeedWorld()
    try {
      await createLedger(world, 8)
      const output = capture()
      const env = envFor({ SEED_OWNER_PASSWORD: undefined, SEED_OPERATOR_PASSWORD: undefined, SEED_CUSTOMER_PASSWORD: undefined })
      expect(await runCli(['seed'], env, output.io, { connect: async () => runtimeFor(world) })).toBe(1)
      expect(output.text()).toContain('SEED_CREDENTIALS_MISSING')
      expect(output.text()).toContain('SEED_OWNER_PASSWORD')
      expect(await countRows(world, 'stores')).toBe(0)
    } finally {
      await world.close()
    }
  })

  it('seed con una colisión sale con código 1 y lista los conflictos sin escribir', async () => {
    const world = await startSeedWorld()
    try {
      await createLedger(world, 8)
      await world.embedded.pg.query(
        `insert into orders (id, store_id, customer_id, customer_name, customer_phone, items, total, status, delivery_mode,
           substitution_preference, created_at, updated_at) values ($1, 'otra', 'otro', 'Ajeno', '573000000099', '[]'::jsonb,
           1000, 'received', 'pickup', 'similar', now(), now())`, [SEED_ORDERS[0]?.id])
      const output = capture()
      expect(await runCli(['seed'], envFor(), output.io, { connect: async () => runtimeFor(world) })).toBe(1)
      expect(output.text()).toContain('order_id_foreign')
      expect(await countRows(world, 'stores')).toBe(0)
    } finally {
      await world.close()
    }
  })

  it('reset: dry-run devuelve el token y la ejecución con ese token borra los fixtures', async () => {
    const world = await startSeedWorld()
    try {
      await createLedger(world, 8)
      const connect = async () => runtimeFor(world)
      expect(await runCli(['seed'], envFor(), capture().io, { connect })).toBe(0)

      const dry = capture()
      expect(await runCli(['reset'], envFor(), dry.io, { connect })).toBe(0)
      const preview = JSON.parse(dry.out()) as { mode: string; confirmationToken: string; target: { host: string; database: string } }
      expect(preview).toMatchObject({ mode: 'dry-run', target: { host: TEST_HOST, database: 'maui' } })
      expect(await countRows(world, 'orders')).toBe(SEED_ORDERS.length)

      const wrong = capture()
      expect(await runCli(['reset', '--execute', '--confirm=reset-000000000000000000000000'], envFor(), wrong.io, { connect })).toBe(1)
      expect(wrong.text()).toContain('RESET_REJECTED')
      expect(await countRows(world, 'orders')).toBe(SEED_ORDERS.length)

      const executed = capture()
      expect(await runCli(['reset', '--execute', `--confirm=${preview.confirmationToken}`], envFor(), executed.io, { connect })).toBe(0)
      expect(JSON.parse(executed.out())).toMatchObject({ mode: 'executed' })
      expect(await countRows(world, 'orders')).toBe(0)
      expect(await countRows(world, 'catalog_products')).toBe(0)
    } finally {
      await world.close()
    }
  })

  it('un error inesperado no imprime su mensaje (podría llevar la conexión)', async () => {
    const output = capture()
    const connect = async () => { throw new Error(`fallo con ${CONNECTION}`) }
    expect(await runCli(['seed'], envFor(), output.io, { connect })).toBe(1)
    expect(output.text()).toContain('SEED_FAILED')
    expect(output.text()).not.toContain('contrasena-de-conexion-privada')
  })
})
