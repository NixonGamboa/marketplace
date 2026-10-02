import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { StoredAccount } from '../../src/domain/auth/Account.js'
import { AccountConflictError, AuthPersistenceError } from '../../src/domain/auth/errors.js'
import { AuthRepositoryPostgres } from '../../src/infra/postgres/AuthRepositoryPostgres.js'
import * as schema from '../../src/infra/postgres/schema.js'

const querySchema = z.object({ query: z.string(), params: z.array(z.unknown()) })
const requestSchema = z.union([querySchema, z.object({ queries: z.array(querySchema) })])
const journalSchema = z.object({ entries: z.array(z.object({ tag: z.string() })) })
const now = '2026-10-01T12:00:00.000Z'
const customer: StoredAccount = {
  id: 'customer-fixture', role: 'customer', name: 'Cliente de prueba',
  phone: '573001234567', email: null, storeId: null, status: 'active',
  passwordHash: 'fixture-secret-not-for-login', createdAt: now, updatedAt: now,
}

describe('AuthRepositoryPostgres y migraciones sobre PostgreSQL embebido', () => {
  let pg: PGlite
  let repo: AuthRepositoryPostgres
  const originalFetch = neonConfig.fetchFunction

  beforeAll(async () => {
    pg = await PGlite.create()
    const migrations = new URL('../../src/infra/postgres/migrations/', import.meta.url)
    const journal = journalSchema.parse(JSON.parse(readFileSync(new URL('meta/_journal.json', migrations), 'utf8')))
    for (const entry of journal.entries) {
      await pg.exec(readFileSync(new URL(`${entry.tag}.sql`, migrations), 'utf8'))
    }

    // Solo se sustituye el transporte de pruebas. Drizzle y el adapter de
    // producción generan SQL; PostgreSQL ejecuta restricciones, joins y upserts.
    // No contacta Neon ni usa credenciales; no acredita el smoke cloud.
    neonConfig.fetchFunction = async (_url: unknown, init: RequestInit): Promise<Response> => {
      if (typeof init.body !== 'string') throw new Error('Body SQL inesperado')
      const request = requestSchema.parse(JSON.parse(init.body))
      const execute = async (query: z.infer<typeof querySchema>) => {
        const result = await pg.query<unknown[]>(query.query, query.params, { rowMode: 'array' })
        const rows = result.rows.map(row => row.map(value => {
          if (value === null) return null
          if (value instanceof Date) return value.toISOString()
          if (typeof value === 'boolean') return value ? 't' : 'f'
          if (typeof value === 'object') return JSON.stringify(value)
          return String(value)
        }))
        return { rows, fields: result.fields, rowCount: result.affectedRows ?? rows.length }
      }
      try {
        const body = 'queries' in request
          ? { results: await Promise.all(request.queries.map(execute)) }
          : await execute(request)
        return new Response(JSON.stringify(body), { status: 200 })
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
        return new Response(JSON.stringify({ message: 'SQL fixture rechazado', code }), { status: 400 })
      }
    }
    repo = new AuthRepositoryPostgres(drizzle(neon('postgresql://fixture:fixture@localhost/fixture'), { schema }))
  }, 30_000)

  beforeEach(async () => {
    await pg.exec('TRUNCATE auth_sessions, auth_accounts, auth_rate_limits CASCADE')
  })

  afterAll(async () => {
    neonConfig.fetchFunction = originalFetch
    if (pg) await pg.close()
  })

  it('persiste cuenta y timestamps; unique impide duplicar teléfono incluso concurrentemente', async () => {
    const results = await Promise.allSettled([
      repo.createAccount(customer),
      repo.createAccount({ ...customer, id: 'other-customer' }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(AccountConflictError)
    expect(await repo.findAccountByPhone(customer.phone!)).toMatchObject({
      phone: customer.phone, createdAt: now, passwordHash: customer.passwordHash,
    })
  })

  it('CHECK rechaza elevar un cliente a staff sin identidad coherente', async () => {
    await expect(repo.createAccount({ ...customer, role: 'owner' })).rejects.toBeInstanceOf(AuthPersistenceError)
    expect(await repo.findAccountByPhone(customer.phone!)).toBeNull()
  })

  it('JOIN lee rol/tienda vigentes y nunca devuelve el hash; logout no puede revocar sesión ajena', async () => {
    await repo.createAccount(customer)
    await repo.createSession({ id: 'session-fixture', accountId: customer.id, createdAt: now,
      expiresAt: '2026-10-01T20:00:00.000Z', revokedAt: null })
    const before = await repo.findSessionWithAccount('session-fixture')
    expect(before?.account).not.toHaveProperty('passwordHash')
    await repo.revokeSession('session-fixture', 'other-account', now)
    expect((await repo.findSessionWithAccount('session-fixture'))?.session.revokedAt).toBeNull()
    await pg.query('UPDATE auth_accounts SET role=$1, phone=NULL, email=$2, store_id=$3 WHERE id=$4',
      ['operator', 'fixture@example.invalid', 'store-fixture', customer.id])
    expect((await repo.findSessionWithAccount('session-fixture'))?.account).toMatchObject({
      role: 'operator', storeId: 'store-fixture',
    })
    await repo.revokeSession('session-fixture', customer.id, now)
    await repo.revokeSession('session-fixture', customer.id, '2026-10-01T13:00:00.000Z')
    expect((await repo.findSessionWithAccount('session-fixture'))?.session.revokedAt).toBe(now)
  })

  it('FK impide una sesión sin cuenta', async () => {
    await expect(repo.createSession({ id: 'orphan', accountId: 'missing', createdAt: now,
      expiresAt: '2026-10-01T20:00:00.000Z', revokedAt: null })).rejects.toBeInstanceOf(AuthPersistenceError)
  })

  it('upsert reserva exactamente la cota ante peticiones concurrentes y renueva al vencer', async () => {
    const rule = { bucket: 'opaque-fixture', limit: 3, windowSeconds: 60 }
    const results = await Promise.all(Array.from({ length: 12 }, () => repo.reserveAttempt(rule, now)))
    expect(results.filter(result => result.allowed)).toHaveLength(3)
    expect(results.filter(result => !result.allowed).every(result => result.retryAfterSeconds === 60)).toBe(true)
    expect((await repo.reserveAttempt(rule, '2026-10-01T12:00:59.999Z')).allowed).toBe(false)
    expect((await repo.reserveAttempt(rule, '2026-10-01T12:01:00.000Z')).allowed).toBe(true)
    await repo.clearAttempts(rule.bucket)
    expect((await repo.reserveAttempt(rule, now)).allowed).toBe(true)
  })
})
