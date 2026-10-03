import { randomBytes } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { orderListResponseSchema } from '../../../shared/contracts/index.js'
import type { CliIo } from '../../src/infra/seed/cli.js'
import { SEED_CUSTOMERS, SEED_ORDERS, SEED_STAFF } from '../../src/usecases/seed/dataset.js'
import type { SmokeClient, SmokeResponse } from '../../src/usecases/seed/smoke.js'
import { authRequest, bodyOf, cookiePair, headerOf, mockResponse, statusOf } from '../auth/httpFixture.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from '../integration/pgliteNeon.js'
import { testCredentials } from './seedFixture.js'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

/**
 * Seed por la composición real del CLI (config validada, factory de repositorios y auth) sobre
 * PostgreSQL embebido, leído luego por los handlers HTTP reales con scrypt/JWT/sesiones reales y
 * por el smoke. APP_ENV=test con destino declarado, igual que Preview. No contacta Neon ni Vercel.
 */

const ORIGIN = 'https://maui-test.example.com'
const TEST_HOST = 'ep-fixture-dev.example.neon.tech'
const HANDLERS = {
  health: () => import('../../../api/health.js'),
  login: () => import('../../../api/auth/login.js'),
  orders: () => import('../../../api/orders/index.js'),
  detail: () => import('../../../api/orders/[id].js'),
  status: () => import('../../../api/orders/[id]/status.js'),
  audit: () => import('../../../api/audit.js'),
  catalog: () => import('../../../api/catalog.js'),
  store: () => import('../../../api/store.js'),
}

/** Reproduce los rewrites de `vercel.json` para las rutas que usa el smoke. */
function route(path: string): { handler: keyof typeof HANDLERS; query: Record<string, string> } {
  const url = new URL(path, ORIGIN)
  const query = Object.fromEntries(url.searchParams)
  const segments = url.pathname.split('/').filter(Boolean)
  if (url.pathname === '/api/health') return { handler: 'health', query }
  if (url.pathname === '/api/auth/login') return { handler: 'login', query }
  if (url.pathname === '/api/audit') return { handler: 'audit', query }
  if (url.pathname === '/api/store') return { handler: 'store', query }
  if (url.pathname === '/api/catalog') return { handler: 'catalog', query }
  if (url.pathname === '/api/catalog/staff') return { handler: 'catalog', query: { ...query, op: 'staff' } }
  if (url.pathname === '/api/orders') return { handler: 'orders', query }
  if (segments[0] === 'api' && segments[1] === 'orders' && segments.length === 3) return { handler: 'detail', query: { ...query, id: segments[2] as string } }
  if (segments[0] === 'api' && segments[1] === 'orders' && segments[3] === 'status') return { handler: 'status', query: { ...query, id: segments[2] as string } }
  throw new Error(`Ruta sin handler en la prueba: ${path}`)
}

interface CallInit {
  cookie?: string | undefined
  body?: unknown
  headers?: Record<string, string>
}

/** Invoca el handler real en proceso, con la misma forma de petición que el fetch del smoke. */
async function call(method: string, path: string, init: CallInit = {}): Promise<SmokeResponse> {
  const { handler, query } = route(path)
  const { default: run } = await HANDLERS[handler]()
  const req = Object.assign(
    authRequest({
      method, body: init.body,
      headers: { origin: ORIGIN, cookie: init.cookie, ...(init.body === undefined ? { 'content-type': undefined } : {}), ...init.headers },
    }),
    { query },
  ) as VercelRequest
  const res = mockResponse()
  await run(req, res as unknown as VercelResponse)
  const cookie = headerOf(res, 'Set-Cookie')
  return { status: statusOf(res), json: bodyOf(res) ?? null, cookie: cookie && !cookie.includes('Max-Age=0') ? cookiePair(res) : undefined }
}

/** Cliente del smoke: la misma interfaz que el fetch real, contra los handlers. */
const handlerClient: SmokeClient = {
  request: (method, path, init) => call(method, path, init),
}

describe('seed + handlers HTTP reales (APP_ENV=test)', () => {
  let embedded: EmbeddedPostgres
  const passwords = testCredentials()
  const output: string[] = []
  const io: CliIo = { out: line => output.push(line), err: line => output.push(line) }

  const cli = async (...argv: string[]): Promise<number> => {
    const { runCli } = await import('../../src/infra/seed/cli.js')
    return runCli(argv, process.env, io)
  }
  const lastJson = (): unknown => JSON.parse(output.at(-1) ?? 'null')

  beforeAll(async () => {
    vi.resetModules()
    vi.stubEnv('APP_ENV', 'test')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('DB_DRIVER', 'postgres')
    vi.stubEnv('DATABASE_URL', `postgresql://fixture:fixture@${TEST_HOST}/postgres`)
    vi.stubEnv('TEST_DATABASE_HOST', TEST_HOST)
    vi.stubEnv('TEST_DATABASE_NAME', 'postgres')
    vi.stubEnv('PRODUCTION_DATABASE_HOST', 'ep-fixture-prod.example.neon.tech')
    vi.stubEnv('PRODUCTION_DATABASE_NAME', 'postgres')
    vi.stubEnv('AUTH_JWT_SECRET', randomBytes(32).toString('base64'))
    vi.stubEnv('AUTH_ORIGIN', ORIGIN)
    vi.stubEnv('SEED_OWNER_PASSWORD', passwords.owner)
    vi.stubEnv('SEED_OPERATOR_PASSWORD', passwords.operator)
    vi.stubEnv('SEED_CUSTOMER_PASSWORD', passwords.customer)
    embedded = await startEmbeddedPostgres()
    await embedded.pg.exec('create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)')
    for (let index = 0; index < 8; index += 1) await embedded.pg.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [`h${index}`, index])
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await embedded.close()
  })

  it('siembra por el CLI real y el smoke del despliegue pasa de punta a punta', async () => {
    expect(await cli('seed')).toBe(0)
    expect((lastJson() as { report: { orders: unknown[] } }).report.orders).toHaveLength(SEED_ORDERS.length)

    const { runSmoke } = await import('../../src/usecases/seed/smoke.js')
    const report = await runSmoke(handlerClient, passwords)
    expect(report.checks.filter(check => !check.ok)).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.checks.length).toBeGreaterThanOrEqual(14)
  })

  it('roles y credenciales: cada cuenta entra con su rol y una contraseña errónea no entra ni cambia nada', async () => {
    const owner = SEED_STAFF[0]!
    const wrong = await handlerClient.request('POST', '/api/auth/login', { body: { method: 'email', email: owner.email, password: 'contrasena-erronea-123' } })
    expect(wrong.status).toBe(401)
    expect(wrong.cookie).toBeUndefined()
    const right = await handlerClient.request('POST', '/api/auth/login', { body: { method: 'email', email: owner.email, password: passwords.owner } })
    expect(right.status).toBe(200)
    const ana = await handlerClient.request('POST', '/api/auth/login', { body: { method: 'phone', phone: `57${SEED_CUSTOMERS[0]!.phone}`, password: passwords.customer } })
    expect(ana.status).toBe(200)
    // Un cliente no puede entrar por el canal de personal con su contraseña.
    const crossed = await handlerClient.request('POST', '/api/auth/login', { body: { method: 'email', email: owner.email, password: passwords.customer } })
    expect(crossed.status).toBe(401)
  })

  it('el negocio opera sobre lo sembrado: un cliente no puede pedir el agotado y el operario sí cambia estados', async () => {
    const ana = await handlerClient.request('POST', '/api/auth/login', { body: { method: 'phone', phone: `57${SEED_CUSTOMERS[0]!.phone}`, password: passwords.customer } })
    const anaId = SEED_CUSTOMERS[0]!.id
    const order = await call('POST', '/api/orders', {
      cookie: ana.cookie, headers: { 'idempotency-key': 'seed-test-agotado-0001' }, body: {
        userId: anaId, items: [{ id: 'jabon-bano-3pack', qty: 1 }], substitutionPreference: 'similar', deliveryType: 'pickup',
        deliveryData: {}, customerName: 'Ana Prueba', customerPhone: SEED_CUSTOMERS[0]!.phone,
      },
    })
    expect(order.status).toBe(400)
    expect(order.json).toMatchObject({ error: 'VALIDATION_ERROR', issues: [{ path: 'items.0.id' }] })

    const operator = await handlerClient.request('POST', '/api/auth/login', { body: { method: 'email', email: SEED_STAFF[1]!.email, password: passwords.operator } })
    const advanced = await handlerClient.request('PATCH', `/api/orders/${SEED_ORDERS[0]!.id}/status`, {
      cookie: operator.cookie, body: { status: 'confirmed', expectedVersion: 1 },
    })
    expect(advanced.status).toBe(200)
  })

  it('resembrar tras la edición conserva el estado del operario y el smoke sigue verde', async () => {
    expect(await cli('seed')).toBe(0)
    const report = (lastJson() as { report: { orders: { id: string; outcome: string; status: string }[] } }).report
    expect(report.orders.find(order => order.id === SEED_ORDERS[0]!.id)).toMatchObject({ outcome: 'preserved', status: 'confirmed' })
    expect(report.orders.filter(order => order.id !== SEED_ORDERS[0]!.id).every(order => order.outcome === 'unchanged')).toBe(true)

    const { runSmoke } = await import('../../src/usecases/seed/smoke.js')
    expect((await runSmoke(handlerClient, passwords)).ok).toBe(true)
  })

  it('el listado del propietario cumple el contrato y expone estimado y final según el estado', async () => {
    const owner = await handlerClient.request('POST', '/api/auth/login', { body: { method: 'email', email: SEED_STAFF[0]!.email, password: passwords.owner } })
    const list = await handlerClient.request('GET', '/api/orders?limit=100', { cookie: owner.cookie })
    const orders = orderListResponseSchema.parse(list.json).items
    expect(orders).toHaveLength(SEED_ORDERS.length)
    // El pedido recibido lo confirmó el operario en la prueba anterior: ya no hay ninguno en received.
    expect([...new Set(orders.map(order => order.status))].sort()).toEqual(['cancelled', 'confirmed', 'delivered', 'in_delivery', 'preparing', 'ready'])
    for (const order of orders) {
      expect(order.estimatedTotal).toBeGreaterThan(0)
      const delivering = ['ready', 'in_delivery', 'delivered'].includes(order.status)
      expect(order.finalTotal !== undefined).toBe(delivering)
    }
  })

  it('el smoke se detiene si la API no declara entorno de test', async () => {
    const { runSmoke } = await import('../../src/usecases/seed/smoke.js')
    const production: SmokeClient = { request: async () => ({ status: 200, json: { status: 'ok', database: 'connected', environment: 'production' } }) }
    const report = await runSmoke(production, passwords)
    expect(report.ok).toBe(false)
    expect(report.checks).toHaveLength(1)
  })

  it('ninguna salida del CLI contiene credenciales ni la conexión', () => {
    const text = output.join('\n')
    for (const secret of [...Object.values(passwords), 'fixture:fixture']) expect(text).not.toContain(secret)
    expect(text).not.toMatch(/postgres(ql)?:\/\/|password_hash|scrypt/i)
  })
})
