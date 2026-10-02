import type { SQL } from 'drizzle-orm'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { StoredAccount } from '../../src/domain/auth/Account.js'
import { AccountConflictError, AuthPersistenceError } from '../../src/domain/auth/errors.js'
import { AuthRepositoryPostgres } from '../../src/infra/postgres/AuthRepositoryPostgres.js'
import type { Db } from '../../src/infra/postgres/client.js'
import { authAccountsTable, authRateLimitsTable, authSessionsTable } from '../../src/infra/postgres/schema.js'

const NOW = '2026-10-01T12:00:00.000Z'
const NOW_MS = Date.parse(NOW)
const rule = { bucket: 'login:phone:abc', limit: 3, windowSeconds: 900 }

const repositoryWith = (db: unknown) => new AuthRepositoryPostgres(db as Db)

const account: StoredAccount = {
  id: 'acc_abc',
  role: 'customer',
  name: 'Ana',
  phone: '573001234567',
  email: null,
  storeId: null,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
  passwordHash: 'scrypt$1$32768$8$3$salt$hash',
}

describe('AuthRepositoryPostgres.reserveAttempt (upsert atómico)', () => {
  const dialect = new PgDialect()

  it('emite UN INSERT … ON CONFLICT DO UPDATE con reinicio de ventana y tope', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ attempts: 1, window_start_ms: String(NOW_MS) }] })
    await repositoryWith({ execute }).reserveAttempt(rule, NOW)

    expect(execute).toHaveBeenCalledTimes(1)
    const query = dialect.sqlToQuery(execute.mock.calls[0]?.[0] as SQL)
    const text = query.sql.replace(/\s+/g, ' ')
    expect(text).toContain('INSERT INTO auth_rate_limits AS rl (bucket, window_start, attempts)')
    expect(text).toContain('ON CONFLICT (bucket) DO UPDATE SET')
    expect(text).toContain('LEAST(rl.attempts + 1,')
    expect(text).toContain('make_interval(secs =>')
    expect(text).toContain('RETURNING attempts,')
    // Todo valor del llamador viaja como parámetro, nunca interpolado en el texto SQL.
    expect(text).not.toContain(rule.bucket)
    expect(query.params).toEqual(expect.arrayContaining([rule.bucket, NOW, rule.windowSeconds, rule.limit + 1]))
  })

  it('permite hasta la cota y deniega al superarla, con espera hasta el fin de ventana', async () => {
    const windowStart = NOW_MS - 60_000
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ attempts: 3, window_start_ms: String(windowStart) }] })
      .mockResolvedValueOnce({ rows: [{ attempts: '4', window_start_ms: String(windowStart) }] })
    const repository = repositoryWith({ execute })

    expect(await repository.reserveAttempt(rule, NOW)).toEqual({ allowed: true, retryAfterSeconds: 840 })
    expect(await repository.reserveAttempt(rule, NOW)).toEqual({ allowed: false, retryAfterSeconds: 840 })
  })

  it('la espera nunca baja de 1 segundo', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ attempts: 9, window_start_ms: String(NOW_MS - 900_000) }] })
    expect((await repositoryWith({ execute }).reserveAttempt(rule, NOW)).retryAfterSeconds).toBe(1)
  })

  it('una respuesta vacía o corrupta es un fallo de persistencia (503), no un permiso', async () => {
    await expect(repositoryWith({ execute: vi.fn().mockResolvedValue({ rows: [] }) }).reserveAttempt(rule, NOW)).rejects.toBeInstanceOf(
      AuthPersistenceError,
    )
    const corrupt = vi.fn().mockResolvedValue({ rows: [{ attempts: 'x', window_start_ms: 'y' }] })
    await expect(repositoryWith({ execute: corrupt }).reserveAttempt(rule, NOW)).rejects.toBeInstanceOf(AuthPersistenceError)
  })

  it('un error del driver no se propaga: se reduce a AuthPersistenceError sin URL ni SQL', async () => {
    const leaky = new Error('connection to postgresql://usuario:secreto@host/db failed: INSERT INTO auth_rate_limits')
    const error = await repositoryWith({ execute: vi.fn().mockRejectedValue(leaky) })
      .reserveAttempt(rule, NOW)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AuthPersistenceError)
    expect(String((error as Error).message)).not.toMatch(/secreto|postgresql|INSERT/)
    expect((error as Error).cause).toBeUndefined()
  })
})

describe('AuthRepositoryPostgres · cuentas y sesiones', () => {
  it('createAccount: INSERT … ON CONFLICT DO NOTHING; sin fila devuelta es conflicto', async () => {
    const returning = vi.fn().mockResolvedValueOnce([{ id: account.id }]).mockResolvedValueOnce([])
    const db = { insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning }) }) }) }
    const repository = repositoryWith(db)
    await expect(repository.createAccount(account)).resolves.toBeUndefined()
    await expect(repository.createAccount(account)).rejects.toBeInstanceOf(AccountConflictError)
  })

  it('createAccount: un fallo distinto de conflicto es persistencia, no conflicto', async () => {
    const returning = vi.fn().mockRejectedValue(new Error('timeout hacia ep-test.neon.tech'))
    const db = { insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning }) }) }) }
    await expect(repositoryWith(db).createAccount(account)).rejects.toBeInstanceOf(AuthPersistenceError)
  })

  const selectChain = (rows: unknown[]) => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => rows }),
        innerJoin: () => ({ where: () => ({ limit: async () => rows }) }),
      }),
    }),
  })

  const row = {
    id: 'acc_abc',
    role: 'owner',
    name: 'Dueña',
    phone: null,
    email: 'duena@maui.test',
    storeId: 'leche-y-miel',
    passwordHash: 'hash',
    status: 'active',
    createdAt: '2026-10-01 12:00:00.123456+00',
    updatedAt: '2026-10-01 12:00:00+00',
  }

  it('mapea la fila de cuenta normalizando timestamps de Postgres', async () => {
    const found = await repositoryWith(selectChain([row])).findAccountByEmail('duena@maui.test')
    expect(found).toMatchObject({
      id: 'acc_abc',
      role: 'owner',
      storeId: 'leche-y-miel',
      passwordHash: 'hash',
      createdAt: '2026-10-01T12:00:00.123Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    })
    expect(await repositoryWith(selectChain([])).findAccountByPhone('573001234567')).toBeNull()
  })

  it('un rol o estado inválido en BD no se interpreta: falla como persistencia', async () => {
    await expect(repositoryWith(selectChain([{ ...row, role: 'admin' }])).findAccountByEmail('x@y.co')).rejects.toBeInstanceOf(
      AuthPersistenceError,
    )
    await expect(repositoryWith(selectChain([{ ...row, status: 'suspended' }])).findAccountByEmail('x@y.co')).rejects.toBeInstanceOf(
      AuthPersistenceError,
    )
  })

  it('findSessionWithAccount: una lectura con JOIN, cuenta sin hash y revokedAt nulo', async () => {
    const { passwordHash: _omitted, ...publicRow } = row
    const sessionRow = {
      id: 'ses_abc',
      accountId: 'acc_abc',
      createdAt: '2026-10-01 12:00:00+00',
      expiresAt: '2026-10-01 20:00:00+00',
      revokedAt: null,
    }
    const found = await repositoryWith(selectChain([{ session: sessionRow, account: publicRow }])).findSessionWithAccount('ses_abc')
    expect(found?.session).toEqual({
      id: 'ses_abc',
      accountId: 'acc_abc',
      createdAt: '2026-10-01T12:00:00.000Z',
      expiresAt: '2026-10-01T20:00:00.000Z',
      revokedAt: null,
    })
    expect(found?.account).not.toHaveProperty('passwordHash')
    expect(await repositoryWith(selectChain([])).findSessionWithAccount('ses_x')).toBeNull()
  })

  it('revokeSession: UPDATE condicionado a sesión, cuenta y no revocada', async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    await repositoryWith({ update }).revokeSession('ses_abc', 'acc_abc', NOW)
    expect(set).toHaveBeenCalledWith({ revokedAt: NOW })
    const condition = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0] as SQL)
    expect(condition.sql).toMatch(/"id" = \$1 and .*"account_id" = \$2 and .*"revoked_at" is null/)
    expect(condition.params).toEqual(['ses_abc', 'acc_abc'])
  })
})

describe('schema de auth', () => {
  it('cuentas: índices únicos de phone/email y CHECK de forma y estado', () => {
    const config = getTableConfig(authAccountsTable)
    expect(config.name).toBe('auth_accounts')
    const unique = config.indexes.filter(index => index.config.unique).map(index => index.config.name)
    expect(unique.sort()).toEqual(['auth_accounts_email_unique', 'auth_accounts_phone_unique'])
    expect(config.checks.map(check => check.name).sort()).toEqual(['auth_accounts_identity_shape', 'auth_accounts_status_valid'])
  })

  it('sesiones: FK a cuentas con cascade e índice por cuenta', () => {
    const config = getTableConfig(authSessionsTable)
    expect(config.name).toBe('auth_sessions')
    expect(config.foreignKeys).toHaveLength(1)
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade')
    expect(config.indexes.map(index => index.config.name)).toContain('auth_sessions_by_account')
  })

  it('límites: clave primaria por bucket y los nombres que usa el upsert SQL', () => {
    const config = getTableConfig(authRateLimitsTable)
    expect(config.name).toBe('auth_rate_limits')
    expect(config.columns.map(column => column.name).sort()).toEqual(['attempts', 'bucket', 'window_start'])
    expect(config.columns.find(column => column.name === 'bucket')?.primary).toBe(true)
  })
})
