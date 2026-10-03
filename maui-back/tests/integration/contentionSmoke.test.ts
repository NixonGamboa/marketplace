import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runContentionSmoke, type ContentionClient, type ContentionCredentials } from '../smoke/contention.js'
import { startHttpWorld, type HttpWorld } from './httpWorld.js'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

/**
 * Valida el GUION del smoke de contención contra los handlers en proceso (PGlite serializa las
 * conexiones, así que esto NO acredita contención en Neon: esa evidencia sale de ejecutar
 * `tests/smoke/contention.cli.ts` contra el despliegue de test). Sirve para que el guion no se pudra
 * y para comprobar que detecta un CAS roto, se niega a correr fuera de test y limpia lo que crea.
 */
describe('guion del smoke de contención (handlers en proceso)', () => {
  let world: HttpWorld
  beforeAll(async () => { world = await startHttpWorld() })
  afterAll(async () => { await world?.close() })

  const credentials: ContentionCredentials = {
    owner: { email: 'owner@contratos.test', password: 'clave-personal-segura' },
    operator: { email: 'operator@contratos.test', password: 'clave-personal-segura' },
  }
  /** Los handlers en proceso corren con APP_ENV=local; `declareTest` aporta la declaración que haría un despliegue de test. */
  const clientOf = (declareTest: boolean, tamper?: (method: string, path: string, body: unknown) => boolean): ContentionClient => ({
    async request(method, path, init) {
      if (path === '/api/health' && declareTest) return { status: 200, json: { status: 'ok', database: 'connected', environment: 'test' } }
      if (tamper?.(method, path, init?.body)) return { status: 200, json: null }
      const response = await world.fetch(method, path, { cookie: init?.cookie, body: init?.body, headers: init?.headers })
      return { status: response.status, json: response.body, cookie: response.cookie, retryAfter: response.header('Retry-After') }
    },
  })
  const orderStatuses = async () => (await world.embedded.pg.query<{ status: string; n: number }>('select status, count(*)::int n from orders group by status')).rows

  it('se niega a ejecutar si la API no declara environment: test y no crea nada', async () => {
    const before = await orderStatuses()
    const report = await runContentionSmoke(clientOf(false), credentials, { parallelism: 4 })
    expect(report).toMatchObject({ ok: false, blocked: 'la API no declara environment: test', checks: [], orders: { created: 0 } })
    expect(await orderStatuses()).toEqual(before)
  })

  it('con cuota: todos los escenarios pasan, solo toca pedidos propios y los deja cancelados sin filtrar secretos', async () => {
    const activeBefore = (await world.embedded.pg.query<{ n: number }>('select count(*)::int n from auth_sessions where revoked_at is null')).rows[0]!.n
    const report = await runContentionSmoke(clientOf(true), credentials, { parallelism: 6, quota: true, runId: 'unit' })
    expect(report.checks.filter(check => !check.ok), JSON.stringify(report.checks)).toEqual([])
    expect(report.checks).toHaveLength(5)
    expect(report).toMatchObject({ ok: true, orders: { created: 23, cancelled: 23, cancelFailed: 0 }, sessions: { opened: 4, closed: 4, closeFailed: 0 } })
    const activeAfter = (await world.embedded.pg.query<{ n: number }>('select count(*)::int n from auth_sessions where revoked_at is null')).rows[0]!.n
    expect(activeAfter).toBe(activeBefore)
    const { rows } = await world.embedded.pg.query<{ status: string; n: number }>(`select status, count(*)::int n from orders where customer_name = 'Contención unit' group by status`)
    expect(rows).toEqual([{ status: 'cancelled', n: 23 }])
    expect(JSON.stringify(report)).not.toMatch(/clave-personal-segura|@contratos.test|session=|eyJ/)
  })

  it('detecta un CAS roto: si todos los cambios de estado responden 200 el escenario falla', async () => {
    const report = await runContentionSmoke(clientOf(true, (method, path, body) => method === 'PATCH' && path.endsWith('/status') && (body as { status?: string }).status === 'confirmed'),
      credentials, { parallelism: 4, runId: 'broken' })
    expect(report.ok).toBe(false)
    expect(report.checks.find(check => check.name.startsWith('CAS: 4 cambios de estado'))).toMatchObject({ ok: false, detail: expect.stringContaining('se esperaba un 200 y el resto 409') })
  })

  it('revoca el login parcial del owner si falla el acceso del operador', async () => {
    const before = (await world.embedded.pg.query<{ n: number }>('select count(*)::int n from auth_sessions where revoked_at is null')).rows[0]!.n
    const failed = await runContentionSmoke(clientOf(true), { ...credentials, operator: { ...credentials.operator, password: 'clave-equivocada' } }, { parallelism: 2 })
    expect(failed).toMatchObject({ ok: false, sessions: { opened: 1, closed: 1, closeFailed: 0 } })
    const after = (await world.embedded.pg.query<{ n: number }>('select count(*)::int n from auth_sessions where revoked_at is null')).rows[0]!.n
    expect(after).toBe(before)
  })
})
