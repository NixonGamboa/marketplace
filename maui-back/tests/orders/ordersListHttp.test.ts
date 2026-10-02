import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { orderListResponseSchema, type OrderListResponse } from '../../../shared/contracts/index.js'
import type { Order } from '../../src/domain/orders/Order.js'
import type { StoredAccount } from '../../src/domain/auth/Account.js'
import type { AuthRepositoryMemory } from '../../src/infra/memory/AuthRepositoryMemory.js'
import { createStaffAccount } from '../../src/usecases/auth/createStaffAccount.js'
import {
  HTTP_ORIGIN,
  HTTP_SECRET,
  authRequest,
  bodyOf,
  cookiePair,
  headerOf,
  mockResponse,
  statusOf,
  type MockResponse,
} from '../auth/httpFixture.js'
import { internalOrder } from '../contratos/fixtures.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from '../integration/pgliteNeon.js'

// Crypto real (scrypt/JWT) como en el resto de pruebas HTTP.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 90_000 })

interface Actor {
  id: string
  cookie: string
}

const unauthenticated = { error: 'UNAUTHENTICATED', message: 'Credenciales o sesión inválidas' }
const forbidden = { error: 'FORBIDDEN', message: 'No tiene permisos para esta operación' }

const idOf = (n: number) => `01HJ${String(n).padStart(22, '0')}`
const at = (seconds: number) => new Date(Date.UTC(2026, 8, 3, 10, 0, seconds)).toISOString()

async function call(req: VercelRequest): Promise<MockResponse> {
  const { default: handler } = await import('../../../api/orders/index.js')
  const res = mockResponse()
  await handler(req, res as unknown as VercelResponse)
  return res
}

const listReq = ({ cookie, query = {}, headers }: { cookie?: string; query?: Record<string, unknown>; headers?: Record<string, string | undefined> } = {}) =>
  Object.assign(authRequest({ method: 'GET', headers: { cookie, origin: undefined, 'content-type': undefined, ...headers } }), { query })

const list = async (actor: Actor | undefined, query: Record<string, unknown> = {}) => {
  const res = await call(listReq({ ...(actor ? { cookie: actor.cookie } : {}), query }))
  return { res, status: statusOf(res), body: bodyOf(res) }
}

const page = async (actor: Actor, query: Record<string, unknown> = {}): Promise<OrderListResponse> => {
  const { status, body } = await list(actor, query)
  expect(status).toBe(200)
  return orderListResponseSchema.parse(body)
}

const ids = (response: OrderListResponse) => response.items.map(item => item.orderId)

describe.each(['memory', 'postgres'] as const)('GET /api/orders con %s', driver => {
  let embedded: EmbeddedPostgres | undefined
  const world = {} as Record<'customerA' | 'customerB' | 'owner' | 'operator' | 'foreignOwner', Actor>

  /** Cambia la cuenta persistida como lo haría un administrador fuera de la request. */
  async function patchAccount(id: string, patch: { status?: 'disabled' | 'active'; storeId?: string; role?: 'owner' | 'operator' }) {
    if (embedded) {
      const { rows } = await embedded.pg.query<StoredAccount>('select id from auth_accounts where id = $1', [id])
      expect(rows).toHaveLength(1)
      if (patch.status) await embedded.pg.query('update auth_accounts set status = $1 where id = $2', [patch.status, id])
      if (patch.storeId) await embedded.pg.query('update auth_accounts set store_id = $1 where id = $2', [patch.storeId, id])
      if (patch.role) await embedded.pg.query('update auth_accounts set role = $1 where id = $2', [patch.role, id])
      return
    }
    const { getAuthRuntime } = await import('../../src/infra/auth/factory.js')
    ;((await getAuthRuntime()).deps.repository as AuthRepositoryMemory).patchAccount(id, patch)
  }

  async function register(name: string, phone: string): Promise<Actor> {
    const { default: handler } = await import('../../../api/auth/register.js')
    const res = mockResponse()
    await handler(authRequest({ body: { name, phone, password: 'clave-cliente-segura' } }), res as unknown as VercelResponse)
    expect(statusOf(res)).toBe(201)
    return { id: (bodyOf(res) as { account: { id: string } }).account.id, cookie: cookiePair(res) }
  }

  async function staff(role: 'owner' | 'operator', email: string, storeId: string): Promise<Actor> {
    const { getAuthRuntime } = await import('../../src/infra/auth/factory.js')
    const { deps } = await getAuthRuntime()
    const password = 'clave-staff-segura-1'
    const account = await createStaffAccount(deps, { role, name: 'Personal Maui', email, storeId, password })
    const { default: login } = await import('../../../api/auth/login.js')
    const res = mockResponse()
    await login(authRequest({ body: { method: 'email', email, password } }), res as unknown as VercelResponse)
    expect(statusOf(res)).toBe(200)
    return { id: account.id, cookie: cookiePair(res) }
  }

  async function seed(order: Partial<Order> & { id: string }) {
    const { getRepositories } = await import('../../src/infra/factory.js')
    await (await getRepositories()).orders.create(internalOrder(order))
  }

  beforeAll(async () => {
    vi.resetModules()
    vi.stubEnv('APP_ENV', 'local')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('DB_DRIVER', driver)
    vi.stubEnv('DATABASE_URL', driver === 'postgres' ? 'postgresql://fixture:fixture@localhost/fixture' : undefined)
    vi.stubEnv('AUTH_JWT_SECRET', HTTP_SECRET)
    vi.stubEnv('AUTH_ORIGIN', HTTP_ORIGIN)
    if (driver === 'postgres') embedded = await startEmbeddedPostgres()

    world.customerA = await register('Ana Pérez', '300 123 4567')
    world.customerB = await register('Beto Ruiz', '300 765 4321')
    world.owner = await staff('owner', 'duena@maui.test', 'leche-y-miel')
    world.operator = await staff('operator', 'operador@maui.test', 'leche-y-miel')
    world.foreignOwner = await staff('owner', 'ajena@otra.test', 'otra-tienda')

    await seed({ id: idOf(1), customerId: world.customerA.id, createdAt: at(1), updatedAt: at(1), customerName: 'Ana Pérez' })
    await seed({ id: idOf(2), customerId: world.customerB.id, createdAt: at(2), updatedAt: at(2), customerName: 'Beto Ruiz', customerPhone: '573007654321' })
    await seed({ id: idOf(3), customerId: world.customerA.id, createdAt: at(3), updatedAt: at(3), customerName: 'Ana Pérez', status: 'preparing' })
    await seed({ id: idOf(4), customerId: world.customerA.id, storeId: 'otra-tienda', createdAt: at(4), updatedAt: at(4) })
    await seed({ id: idOf(5), customerId: world.customerB.id, storeId: 'otra-tienda', createdAt: at(5), updatedAt: at(5) })
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    if (embedded) await embedded.close()
  })

  describe('sesión y protocolo', () => {
    it('sin cookie o con cookie inválida: 401 y nada de datos', async () => {
      const anonymous = await list(undefined)
      expect(anonymous.status).toBe(401)
      expect(anonymous.body).toEqual(unauthenticated)

      const [name, token] = world.customerA.cookie.split('=') as [string, string]
      for (const cookie of [`${name}=${token.slice(0, -3)}xxx`, `${name}=no-es-un-jwt`]) {
        const res = await call(listReq({ cookie }))
        expect(statusOf(res)).toBe(401)
        expect(headerOf(res, 'Set-Cookie')).toMatch(/^maui_session=; .*Max-Age=0/)
      }
    })

    it('401 tiene prioridad sobre una query inválida (no valida sin sesión)', async () => {
      const { status, body } = await list(undefined, { limit: '9999', storeId: 'otra-tienda' })
      expect(status).toBe(401)
      expect(body).toEqual(unauthenticated)
    })

    it('GET no exige Origin y responde sin caché con Vary de cookie', async () => {
      const res = await call(listReq({ cookie: world.customerA.cookie }))
      expect(statusOf(res)).toBe(200)
      expect(headerOf(res, 'Cache-Control')).toContain('no-store')
      expect(headerOf(res, 'Pragma')).toBe('no-cache')
      expect(headerOf(res, 'Vary')).toMatch(/Cookie/)
      expect(headerOf(res, 'Access-Control-Allow-Origin')).toBeUndefined()
    })

    it('un Origin ajeno en GET tampoco impide leer (no es mutación)', async () => {
      const res = await call(listReq({ cookie: world.customerA.cookie, headers: { origin: 'https://evil.example' } }))
      expect(statusOf(res)).toBe(200)
    })

    it('métodos no admitidos: 405 con Allow GET, POST', async () => {
      for (const method of ['PUT', 'DELETE', 'PATCH']) {
        const res = await call(Object.assign(authRequest({ method }), { query: {} }))
        expect(statusOf(res)).toBe(405)
        expect(headerOf(res, 'Allow')).toBe('GET, POST')
        expect(headerOf(res, 'Cache-Control')).toContain('no-store')
      }
    })

    it('un error de validación no refleja la cabecera Cookie ni el valor enviado', async () => {
      const { status, body } = await list(world.customerA, { limit: 'valor-secreto-xyz' })
      expect(status).toBe(400)
      expect(JSON.stringify(body)).not.toContain('valor-secreto-xyz')
      expect(JSON.stringify(body)).not.toContain(world.customerA.cookie.split('=')[1])
    })
  })

  describe('aislamiento por actor', () => {
    it('cliente: solo sus pedidos, también los de otras tiendas', async () => {
      expect(ids(await page(world.customerA))).toEqual([idOf(4), idOf(3), idOf(1)])
      expect(ids(await page(world.customerB))).toEqual([idOf(5), idOf(2)])
    })

    it('owner y operator: pedidos de su tienda; el de otra tienda solo los suyos', async () => {
      for (const actor of [world.owner, world.operator]) {
        expect(ids(await page(actor))).toEqual([idOf(3), idOf(2), idOf(1)])
      }
      expect(ids(await page(world.foreignOwner))).toEqual([idOf(5), idOf(4)])
    })

    it('inyección de alcance por query, cabeceras o body: 400 o ignorada, nunca amplía el resultado', async () => {
      for (const query of [
        { storeId: 'otra-tienda' }, { store: 'otra-tienda' }, { customerId: world.customerB.id },
        { userId: world.customerB.id }, { scope: 'all' }, { role: 'owner' }, { 'customer[id]': world.customerB.id },
      ]) {
        const { status } = await list(world.customerA, query)
        expect(status).toBe(400)
      }
      const res = await call(listReq({
        cookie: world.customerA.cookie,
        headers: { 'x-store-id': 'otra-tienda', 'x-user-id': world.customerB.id, authorization: 'Bearer otro' },
      }))
      expect(statusOf(res)).toBe(200)
      expect(ids(orderListResponseSchema.parse(bodyOf(res)))).toEqual([idOf(4), idOf(3), idOf(1)])

      const withBody = Object.assign(listReq({ cookie: world.customerA.cookie }), { body: { storeId: 'otra-tienda', customerId: world.customerB.id } })
      expect(ids(orderListResponseSchema.parse(bodyOf(await call(withBody))))).toEqual([idOf(4), idOf(3), idOf(1)])
    })

    it('los ítems usan el DTO canónico del detalle y no exponen storeId', async () => {
      const { items } = await page(world.owner)
      const detail = await import('../../../api/orders/[id].js')
      const res = mockResponse()
      await detail.default(
        Object.assign(authRequest({ method: 'GET', headers: { cookie: world.owner.cookie, origin: undefined, 'content-type': undefined } }), { query: { id: idOf(3) } }),
        res as unknown as VercelResponse,
      )
      expect(items.find(item => item.orderId === idOf(3))).toEqual(bodyOf(res))
      expect(JSON.stringify(items)).not.toContain('storeId')
      expect(JSON.stringify(items)).not.toContain('otra-tienda')
    })
  })

  describe('filtros, búsqueda y paginación', () => {
    it('status, fechas (from inclusive, to exclusivo) y límite por defecto', async () => {
      expect(ids(await page(world.owner, { status: 'preparing' }))).toEqual([idOf(3)])
      expect(ids(await page(world.owner, { from: at(2), to: at(3) }))).toEqual([idOf(2)])
      expect(ids(await page(world.owner, { from: at(2) }))).toEqual([idOf(3), idOf(2)])
      expect(ids(await page(world.owner, { to: at(2) }))).toEqual([idOf(1)])
      expect(ids(await page(world.owner, { from: '2026-09-03T05:00:02-05:00', to: '2026-09-03T05:00:03.000-05:00' }))).toEqual([idOf(2)])
    })

    it('búsqueda por prefijo de ID, nombre y teléfono', async () => {
      expect(ids(await page(world.owner, { q: idOf(2).toLowerCase() }))).toEqual([idOf(2)])
      expect(ids(await page(world.owner, { q: 'beto' }))).toEqual([idOf(2)])
      expect(ids(await page(world.owner, { q: '300 765 4321' }))).toEqual([idOf(2)])
      expect(ids(await page(world.owner, { q: 'ana' }))).toEqual([idOf(3), idOf(1)])
      expect(ids(await page(world.operator, { q: 'nadie' }))).toEqual([])
    })

    it('recorre páginas con cursor y la última no trae nextCursor', async () => {
      const first = await page(world.owner, { limit: '2' })
      expect(ids(first)).toEqual([idOf(3), idOf(2)])
      expect(first.nextCursor).not.toBeNull()
      const second = await page(world.owner, { limit: '2', cursor: first.nextCursor! })
      expect(ids(second)).toEqual([idOf(1)])
      expect(second.nextCursor).toBeNull()
    })

    it('el cursor no sirve a otra cuenta, otros filtros ni otro rol: 400 genérico', async () => {
      const { nextCursor } = await page(world.owner, { limit: '1' })
      for (const [actor, query] of [
        [world.operator, {}], [world.owner, { status: 'received' }], [world.foreignOwner, {}], [world.customerA, {}],
      ] as const) {
        const { status, body } = await list(actor, { ...query, cursor: nextCursor })
        expect(status).toBe(400)
        expect(body).toMatchObject({ error: 'VALIDATION_ERROR', issues: [{ path: 'cursor' }] })
      }
    })

    it.each([
      { limit: '0' }, { limit: '101' }, { limit: '10abc' }, { status: 'x' }, { q: '' }, { from: '2026-09-03' },
      { from: at(5), to: at(1) }, { status: ['received', 'ready'] }, { cursor: 'no-es-cursor' },
    ])('query inválida %j: 400 sin tocar datos', async query => {
      const { status, body } = await list(world.owner, query)
      expect(status).toBe(400)
      expect(body).toMatchObject({ error: 'VALIDATION_ERROR' })
    })
  })

  describe('autorización vigente en cada request', () => {
    it('cuenta deshabilitada: 401 en la siguiente lectura y recupera al reactivarse', async () => {
      await patchAccount(world.customerB.id, { status: 'disabled' })
      try {
        const { status, body } = await list(world.customerB)
        expect(status).toBe(401)
        expect(body).toEqual(unauthenticated)
      } finally {
        await patchAccount(world.customerB.id, { status: 'active' })
      }
      expect(ids(await page(world.customerB))).toEqual([idOf(5), idOf(2)])
    })

    it('sesión revocada por logout: 401 aunque la cookie siga firmada', async () => {
      const second = await (async () => {
        const { default: login } = await import('../../../api/auth/login.js')
        const res = mockResponse()
        await login(authRequest({ body: { method: 'phone', phone: '300 123 4567', password: 'clave-cliente-segura' } }), res as unknown as VercelResponse)
        return cookiePair(res)
      })()
      expect(statusOf(await call(listReq({ cookie: second })))).toBe(200)

      const { default: logout } = await import('../../../api/auth/logout.js')
      const out = mockResponse()
      await logout(authRequest({ headers: { cookie: second, 'content-type': undefined } }), out as unknown as VercelResponse)
      expect(statusOf(out)).toBe(204)
      expect(statusOf(await call(listReq({ cookie: second })))).toBe(401)
      expect(statusOf(await call(listReq({ cookie: world.customerA.cookie })))).toBe(200)
    })

    it('la tienda del personal se lee de la cuenta en cada request: reasignarlo cambia el alcance y el cursor', async () => {
      const guest = await staff('operator', 'rotativo@maui.test', 'leche-y-miel')
      expect(ids(await page(guest))).toEqual([idOf(3), idOf(2), idOf(1)])
      const { nextCursor } = await page(guest, { limit: '1' })

      await patchAccount(guest.id, { storeId: 'otra-tienda' })
      expect(ids(await page(guest))).toEqual([idOf(5), idOf(4)])
      const stale = await list(guest, { limit: '1', cursor: nextCursor })
      expect(stale.status).toBe(400)
    })

    it('el rol se lee de la cuenta en cada request: el cursor emitido a un owner no vale como operator', async () => {
      const promoted = await staff('owner', 'cambio@maui.test', 'leche-y-miel')
      const { nextCursor } = await page(promoted, { limit: '1' })
      await patchAccount(promoted.id, { role: 'operator' })
      expect(ids(await page(promoted))).toEqual([idOf(3), idOf(2), idOf(1)])
      expect((await list(promoted, { limit: '1', cursor: nextCursor })).status).toBe(400)
    })
  })

  describe('errores seguros', () => {
    it('fallo del repositorio: 503 genérico sin SQL, parámetros ni datos', async () => {
      const { getRepositories } = await import('../../src/infra/factory.js')
      const { OrderPersistenceError } = await import('../../src/domain/orders/orderCreation.js')
      const { orders } = await getRepositories()
      vi.spyOn(orders, 'listPage').mockRejectedValueOnce(new OrderPersistenceError())
      const { status, body } = await list(world.owner, { q: 'secreto-busqueda' })
      expect(status).toBe(503)
      expect(body).toEqual({ error: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible' })
      expect(JSON.stringify(body)).not.toMatch(/select|from|orders|secreto-busqueda/i)
    })

    it('un error inesperado responde 500 genérico', async () => {
      const { getRepositories } = await import('../../src/infra/factory.js')
      const { orders } = await getRepositories()
      vi.spyOn(orders, 'listPage').mockRejectedValueOnce(new Error('connection string postgresql://u:pw@host'))
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { status, body } = await list(world.owner)
      log.mockRestore()
      expect(status).toBe(500)
      expect(JSON.stringify(body)).not.toContain('postgresql://')
    })
  })
})
