import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { neonConfig } from '@neondatabase/serverless'
import { assertSource, assertRestoreTarget, confirmationFor, DEV_HOST, DEV_BRANCH, PROJECT, verifyConfirmation, type RestorePlan } from '../../src/infra/recovery/guard.js'
import { fingerprint, openBackup, sealBackup, validateSnapshot } from '../../src/infra/recovery/format.js'
import { RecoveryPostgres } from '../../src/infra/recovery/postgres.js'
import { startSeedWorld, testCredentials } from '../seed/seedFixture.js'
import { runSeed } from '../../src/usecases/seed/runSeed.js'

const now = Date.parse('2026-10-03T09:00:00.000Z')
const temporary = 'ep-restore-fixture.c-10.us-east-1.aws.neon.tech'
const env = (host = temporary): NodeJS.ProcessEnv => ({ APP_ENV: 'test', DB_DRIVER: 'postgres', DATABASE_URL: `postgresql://fixture:private@${host}/maui?sslmode=require` })
const proof = () => ({ version: 1, projectId: PROJECT, parentBranchId: DEV_BRANCH, branchId: 'br-restore-fixture', endpointId: 'ep-restore-fixture', host: temporary, database: 'maui', temporary: true, createdAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60_000).toISOString(), evidence: { projectId: PROJECT, branch: { id: 'br-restore-fixture', parent_id: DEV_BRANCH }, endpoint: { id: 'ep-restore-fixture', branch_id: 'br-restore-fixture', host: temporary } } })

describe('aislamiento de recuperación', () => {
  it('solo lee fuente dev y solo restaura clon temporal con evidencia coherente', () => {
    expect(assertSource(env(DEV_HOST)).host).toBe(DEV_HOST)
    expect(() => assertSource(env())).toThrow('SOURCE_NOT_DEV')
    expect(assertRestoreTarget(env(), proof(), now).target.host).toBe(temporary)
    for (const invalid of [{ ...proof(), branchId: DEV_BRANCH }, { ...proof(), parentBranchId: 'br-other' }, { ...proof(), evidence: { ...proof().evidence, endpoint: { ...proof().evidence.endpoint, branch_id: 'br-other' } } }, { ...proof(), expiresAt: new Date(now - 1).toISOString() }]) {
      expect(() => assertRestoreTarget(env(), invalid, now)).toThrow()
    }
    expect(() => assertRestoreTarget(env(DEV_HOST), proof(), now)).toThrow('UNSAFE_RESTORE_TARGET')
    expect(() => assertRestoreTarget(env('ep-weathered-salad-auk9jj3u.c-10.us-east-1.aws.neon.tech'), proof(), now)).toThrow('UNSAFE_TARGET')
    expect(() => assertRestoreTarget({ ...env(), PGHOST: temporary }, proof(), now)).toThrow('UNSAFE_ENVIRONMENT')
    expect(() => assertRestoreTarget({ ...env(), VERCEL_ENV: 'production' }, proof(), now)).toThrow('UNSAFE_ENVIRONMENT')
  })
  it('confirmación SHA liga contenido, estado, proof y destino y caduca', () => {
    const plan: RestorePlan = { version: 1, branchId: 'br-fixture', host: temporary, backupHash: 'backup', beforeHash: 'before', provenanceHash: 'proof', createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 300_000).toISOString() }
    expect(() => verifyConfirmation(plan, plan, confirmationFor(plan), now)).not.toThrow()
    for (const field of ['branchId', 'host', 'backupHash', 'beforeHash', 'provenanceHash'] as const) expect(() => verifyConfirmation(plan, { ...plan, [field]: 'changed' }, confirmationFor(plan), now)).toThrow('STALE_CONFIRMATION')
    expect(() => verifyConfirmation(plan, plan, confirmationFor(plan), now + 300_001)).toThrow('STALE_CONFIRMATION')
  })
})

it('backup cifrado y restauración transaccional: integridad, tampering, estado cambiado y rollback FK', async () => {
  const world = await startSeedWorld()
  const originalTransport = neonConfig.fetchFunction!
  // PGlite declara postgres: solo adapta ese dato de la conexión del fixture a maui.
  neonConfig.fetchFunction = async (url: unknown, init: RequestInit) => originalTransport(url, { ...init, body: typeof init.body === 'string' ? init.body.replaceAll('current_database()', "'maui'::text") : init.body })
  try {
    const directory = new URL('../../src/infra/postgres/migrations/', import.meta.url)
    const journal = JSON.parse(await readFile(new URL('meta/_journal.json', directory), 'utf8')) as { entries: { tag: string; when: number }[] }
    await world.embedded.pg.exec('create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)')
    for (const entry of journal.entries) {
      const migration = (await readFile(new URL(`${entry.tag}.sql`, directory), 'utf8')).replace(/\r\n/g, '\n')
      await world.embedded.pg.query('insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)', [createHash('sha256').update(migration).digest('hex'), entry.when])
    }
    await runSeed(world.deps, testCredentials())
    const database = new RecoveryPostgres('postgresql://fixture:fixture@localhost/maui')
    const snapshot = await database.snapshot()
    const key = randomBytes(32).toString('hex')
    const encrypted = sealBackup(snapshot, key)
    expect(encrypted).not.toContain('password_hash')
    expect(encrypted).not.toContain('customer_phone')
    expect(openBackup(encrypted, key).contentHash).toBe(fingerprint(snapshot))
    expect(() => openBackup(encrypted, randomBytes(32).toString('hex'))).toThrow('INVALID_BACKUP')
    const altered = JSON.parse(encrypted) as { ciphertext: string }
    altered.ciphertext = `${altered.ciphertext[0] === 'A' ? 'B' : 'A'}${altered.ciphertext.slice(1)}`
    expect(() => openBackup(JSON.stringify(altered), key)).toThrow('INVALID_BACKUP')
    expect(() => validateSnapshot({ ...snapshot, tables: { ...snapshot.tables, unexpected: [] } })).toThrow('INVALID_SNAPSHOT')
    await world.embedded.pg.exec("update stores set name='sentinel-temporal'")
    const before = await database.snapshot()
    await database.restore(snapshot, before)
    expect(fingerprint(await database.snapshot())).toBe(fingerprint(snapshot))
    await expect(database.restore(snapshot, before)).rejects.toThrow()
    expect(fingerprint(await database.snapshot())).toBe(fingerprint(snapshot))
    const broken = structuredClone(snapshot)
    broken.tables.auth_sessions = [{ id: 'session-orphan', account_id: 'missing', created_at: new Date(now).toISOString(), expires_at: new Date(now + 1).toISOString(), revoked_at: null }]
    await expect(database.restore(broken, snapshot)).rejects.toThrow()
    expect(fingerprint(await database.snapshot())).toBe(fingerprint(snapshot))
  } finally { await world.close() }
}, 120_000)
