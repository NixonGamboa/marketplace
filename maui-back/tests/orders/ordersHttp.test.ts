import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { orderDtoSchema } from '../../../shared/contracts/index.js'
import { SESSION_TTL_SECONDS } from '../../src/domain/auth/policy.js'
import { ORDER_CREATE_POLICY } from '../../src/domain/orders/orderAccess.js'
import type { AuthRepositoryMemory } from '../../src/infra/memory/AuthRepositoryMemory.js'
import { createStaffAccount } from '../../src/usecases/auth/createStaffAccount.js'
import { validPickupRequest } from '../contratos/fixtures.js'
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

// Crypto real: scrypt (registro/login) y JWT firmados por el runtime de auth.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

const handlers = {
  register: () => import('../../../api/auth/register.js'),
  login: () => import('../../../api/auth/login.js'),
  logout: () => import('../../../api/auth/logout.js'),
  create: () => import('../../../api/orders/index.js'),
  detail: () => import('../../../api/orders/[id].js'),
  status: () => import('../../../api/orders/[id]/status.js'),
}

type HandlerName = keyof typeof handlers

async function call(name: HandlerName, req: VercelRequest): Promise<MockResponse> {
  const { default: handler } = await handlers[name]()
  const res = mockResponse()
  await handler(req, res as unknown as VercelResponse)
  return res
}

interface OrderRequestOptions {
  cookie?: string
  id?: string
  body?: unknown
  headers?: Record<string, string | undefined>
}

const withQuery = (req: VercelRequest, id?: string): VercelRequest =>
  Object.assign(req, { query: id === undefined ? {} : { id } })

/** Pedido válido; `userId` debe repetir la cuenta de la sesión y nunca la sustituye. */
const orderBody = (actor?: Actor): Record<string, unknown> => ({
  ...validPickupRequest(),
  userId: actor?.id ?? 'acc_sin_sesion',
})

const createReq = ({ cookie, body = orderBody(), headers }: OrderRequestOptions = {}) =>
  withQuery(authRequest({ body, headers: { cookie, ...headers } }))

const detailReq = ({ cookie, id, headers }: OrderRequestOptions = {}) =>
  withQuery(authRequest({ method: 'GET', headers: { cookie, 'content-type': undefined, ...headers } }), id)

const statusReq = ({ cookie, id, body = { status: 'confirmed' }, headers }: OrderRequestOptions = {}) =>
  withQuery(authRequest({ method: 'PATCH', body, headers: { cookie, ...headers } }), id)

const UNKNOWN_ID = '01HJ0000000000000000000000'
const notFound = (id: string) => ({ error: 'NOT_FOUND', message: `Order ${id} not found` })
const unauthenticated = { error: 'UNAUTHENTICATED', message: 'Credenciales o sesión inválidas' }
const forbidden = { error: 'FORBIDDEN', message: 'No tiene permisos para esta operación' }

interface Actor {
  id: string
  cookie: string
}

const world = {} as {
  customerA: Actor
  customerB: Actor
  owner: Actor
  operator: Actor
  foreignOwner: Actor
  repository: AuthRepositoryMemory
}

async function registerCustomer(name: string, phone: string): Promise<Actor> {
  const res = await call('register', authRequest({ body: { name, phone, password: 'clave-cliente-segura' } }))
  expect(statusOf(res)).toBe(201)
  return { id: (bodyOf(res) as { account: { id: string } }).account.id, cookie: cookiePair(res) }
}

async function loginCustomer(phone: string): Promise<string> {
  const res = await call('login', authRequest({ body: { method: 'phone', phone, password: 'clave-cliente-segura' } }))
  expect(statusOf(res)).toBe(200)
  return cookiePair(res)
}

async function staff(role: 'owner' | 'operator', email: string, storeId: string): Promise<Actor> {
  const { getAuthRuntime } = await import('../../src/infra/auth/factory.js')
  const { deps } = await getAuthRuntime()
  const password = 'clave-staff-segura-1'
  const account = await createStaffAccount(deps, { role, name: 'Personal Maui', email, storeId, password })
  const res = await call('login', authRequest({ body: { method: 'email', email, password } }))
  expect(statusOf(res)).toBe(200)
  return { id: account.id, cookie: cookiePair(res) }
}

async function placeOrder(actor: Actor): Promise<string> {
  const res = await call('create', createReq({ cookie: actor.cookie, body: orderBody(actor) }))
  expect(statusOf(res)).toBe(201)
  return (bodyOf(res) as { orderId: string }).orderId
}

async function storedOrder(id: string) {
  const { getRepositories } = await import('../../src/infra/factory.js')
  const { orders } = await getRepositories()
  return orders.findById(id)
}

async function storedOrderCount(): Promise<number> {
  const { getRepositories } = await import('../../src/infra/factory.js')
  const { orders } = await getRepositories()
  return (await orders.listByStore('leche-y-miel', { limit: 1000 })).length
}

beforeAll(async () => {
  vi.resetModules()
  vi.stubEnv('APP_ENV', 'local')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('VERCEL_ENV', undefined)
  vi.stubEnv('DB_DRIVER', 'memory')
  vi.stubEnv('AUTH_JWT_SECRET', HTTP_SECRET)
  vi.stubEnv('AUTH_ORIGIN', HTTP_ORIGIN)

  world.customerA = await registerCustomer('Ana Pérez', '300 123 4567')
  world.customerB = await registerCustomer('Beto Ruiz', '300 765 4321')
  world.owner = await staff('owner', 'duena@maui.test', 'leche-y-miel')
  world.operator = await staff('operator', 'operador@maui.test', 'leche-y-miel')
  world.foreignOwner = await staff('owner', 'ajena@otra.test', 'otra-tienda')
  const { getAuthRuntime } = await import('../../src/infra/auth/factory.js')
  world.repository = (await getAuthRuntime()).deps.repository as AuthRepositoryMemory
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(() => vi.unstubAllEnvs())

describe('sesión requerida en pedidos', () => {
  it('sin cookie: crear, leer y cambiar estado responden 401 sin persistir', async () => {
    const before = await storedOrderCount()
    const id = await placeOrder(world.customerA)

    for (const res of [
      await call('create', createReq()),
      await call('detail', detailReq({ id })),
      await call('status', statusReq({ id })),
    ]) {
      expect(statusOf(res)).toBe(401)
      expect(bodyOf(res)).toEqual(unauthenticated)
    }
    expect(await storedOrderCount()).toBe(before + 1)
    expect((await storedOrder(id))?.status).toBe('received')
  })

  it('cookie manipulada o ajena al formato: 401 y borra la cookie', async () => {
    const [name, token] = world.customerA.cookie.split('=') as [string, string]
    const [header, payload, signature] = token.split('.') as [string, string, string]
    const tampered = `${name}=${header}.${payload}.${signature.slice(0, -2)}xx`

    for (const cookie of [tampered, `${name}=no-es-un-jwt`, `${name}=`]) {
      const res = await call('detail', detailReq({ cookie, id: UNKNOWN_ID }))
      expect(statusOf(res)).toBe(401)
      expect(headerOf(res, 'Set-Cookie')).toMatch(/^maui_session=; .*Max-Age=0/)
    }
  })

  it('sesión expirada: 401 aunque la firma sea válida', async () => {
    const id = await placeOrder(world.customerA)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + (SESSION_TTL_SECONDS + 1) * 1000)

    const res = await call('detail', detailReq({ cookie: world.customerA.cookie, id }))
    expect(statusOf(res)).toBe(401)
    expect(bodyOf(res)).toEqual(unauthenticated)
  })

  it('sesión revocada por logout: 401; otra sesión vigente de la misma cuenta sigue operando', async () => {
    const id = await placeOrder(world.customerA)
    const second = await loginCustomer('300 123 4567')

    const out = await call('logout', authRequest({ headers: { cookie: second, 'content-type': undefined } }))
    expect(statusOf(out)).toBe(204)

    expect(statusOf(await call('detail', detailReq({ cookie: second, id })))).toBe(401)
    expect(statusOf(await call('create', createReq({ cookie: second })))).toBe(401)
    expect(statusOf(await call('detail', detailReq({ cookie: world.customerA.cookie, id })))).toBe(200)
  })

  it('cuenta deshabilitada: su sesión deja de valer para crear, leer y cambiar estado', async () => {
    const id = await placeOrder(world.customerB)
    world.repository.patchAccount(world.customerB.id, { status: 'disabled' })
    world.repository.patchAccount(world.operator.id, { status: 'disabled' })
    try {
      expect(statusOf(await call('create', createReq({ cookie: world.customerB.cookie })))).toBe(401)
      expect(statusOf(await call('detail', detailReq({ cookie: world.customerB.cookie, id })))).toBe(401)
      expect(statusOf(await call('status', statusReq({ cookie: world.operator.cookie, id })))).toBe(401)
      expect((await storedOrder(id))?.status).toBe('received')
    } finally {
      world.repository.patchAccount(world.customerB.id, { status: 'active' })
      world.repository.patchAccount(world.operator.id, { status: 'active' })
    }
  })
})

describe('creación: actor y tienda desde la sesión', () => {
  it('cliente crea; el dueño es su cuenta y la tienda la fija el servidor', async () => {
    const res = await call('create', createReq({ cookie: world.customerA.cookie, body: orderBody(world.customerA) }))
    expect(statusOf(res)).toBe(201)
    expect(headerOf(res, 'Cache-Control')).toContain('no-store')

    const { orderId } = bodyOf(res) as { orderId: string }
    const stored = await storedOrder(orderId)
    expect(stored).toMatchObject({ customerId: world.customerA.id, storeId: 'leche-y-miel' })
  })

  it('userId igual a la sesión se admite; el de otra cuenta es manipulación (403) y no persiste', async () => {
    const own = await call('create', createReq({ cookie: world.customerA.cookie, body: { ...validPickupRequest(), userId: world.customerA.id } }))
    expect(statusOf(own)).toBe(201)

    const before = await storedOrderCount()
    const res = await call('create', createReq({ cookie: world.customerA.cookie, body: { ...validPickupRequest(), userId: world.customerB.id } }))
    expect(statusOf(res)).toBe(403)
    expect(bodyOf(res)).toEqual(forbidden)
    expect(await storedOrderCount()).toBe(before)
  })

  it('storeId, customerId o status en el body se rechazan (400) sin persistir', async () => {
    const before = await storedOrderCount()
    for (const extra of [{ storeId: 'otra-tienda' }, { customerId: world.customerB.id }, { status: 'delivered' }]) {
      const res = await call('create', createReq({ cookie: world.customerA.cookie, body: { ...orderBody(world.customerA), ...extra } }))
      expect(statusOf(res)).toBe(400)
    }
    expect(await storedOrderCount()).toBe(before)
  })

  it('cabeceras de identidad inventadas no cambian dueño ni tienda', async () => {
    const res = await call(
      'create',
      createReq({
        cookie: world.customerA.cookie,
        body: orderBody(world.customerA),
        headers: {
          'x-user-id': world.customerB.id,
          'x-store-id': 'otra-tienda',
          'x-forwarded-for': '203.0.113.7',
          authorization: 'Bearer cualquiera',
        },
      }),
    )
    expect(statusOf(res)).toBe(201)
    const stored = await storedOrder((bodyOf(res) as { orderId: string }).orderId)
    expect(stored).toMatchObject({ customerId: world.customerA.id, storeId: 'leche-y-miel' })
  })

  it.each(['owner', 'operator', 'foreignOwner'] as const)('%s no puede crear pedidos (403)', async role => {
    const before = await storedOrderCount()
    const res = await call('create', createReq({ cookie: world[role].cookie, body: orderBody(world[role]) }))
    expect(statusOf(res)).toBe(403)
    expect(bodyOf(res)).toEqual(forbidden)
    expect(await storedOrderCount()).toBe(before)
  })

  it('el límite por cuenta responde 429 con Retry-After; otra cuenta no queda afectada', async () => {
    const heavy = await registerCustomer('Cliente Intensivo', '311 222 3344')
    for (let i = 0; i < ORDER_CREATE_POLICY.limit; i += 1) await placeOrder(heavy)

    const denied = await call('create', createReq({ cookie: heavy.cookie, body: orderBody(heavy) }))
    expect(statusOf(denied)).toBe(429)
    expect(Number(headerOf(denied, 'Retry-After'))).toBeGreaterThan(0)

    await placeOrder(world.customerB)
  })
})

describe('lectura: propiedad del cliente y aislamiento por tienda', () => {
  it('el cliente dueño y el personal de la tienda leen el DTO; respuesta privada no-store', async () => {
    const id = await placeOrder(world.customerA)
    for (const actor of [world.customerA, world.owner, world.operator]) {
      const res = await call('detail', detailReq({ cookie: actor.cookie, id }))
      expect(statusOf(res)).toBe(200)
      expect(headerOf(res, 'Cache-Control')).toContain('no-store')
      expect(headerOf(res, 'Vary')).toContain('Cookie')
      const dto = orderDtoSchema.parse(bodyOf(res))
      expect(dto).toMatchObject({ orderId: id, userId: world.customerA.id })
      expect(dto).not.toHaveProperty('storeId')
    }
  })

  it('otro cliente y otra tienda reciben el mismo 404 que un ID inexistente', async () => {
    const id = await placeOrder(world.customerA)
    for (const actor of [world.customerB, world.foreignOwner]) {
      const res = await call('detail', detailReq({ cookie: actor.cookie, id }))
      expect(statusOf(res)).toBe(404)
      expect(bodyOf(res)).toEqual(notFound(id))

      const missing = await call('detail', detailReq({ cookie: actor.cookie, id: UNKNOWN_ID }))
      expect(statusOf(missing)).toBe(404)
      expect(bodyOf(missing)).toEqual(notFound(UNKNOWN_ID))
    }
  })

  it('conocer el ULID y falsificar cabeceras no concede acceso', async () => {
    const id = await placeOrder(world.customerA)
    const res = await call(
      'detail',
      detailReq({
        cookie: world.customerB.cookie,
        id,
        headers: { 'x-user-id': world.customerA.id, 'x-store-id': 'leche-y-miel', 'x-role': 'owner' },
      }),
    )
    expect(statusOf(res)).toBe(404)
  })

  it('la tienda se lee de la cuenta vigente: mover al operador de tienda le retira el acceso', async () => {
    const id = await placeOrder(world.customerA)
    world.repository.patchAccount(world.operator.id, { storeId: 'otra-tienda' })
    try {
      expect(statusOf(await call('detail', detailReq({ cookie: world.operator.cookie, id })))).toBe(404)
    } finally {
      world.repository.patchAccount(world.operator.id, { storeId: 'leche-y-miel' })
    }
    expect(statusOf(await call('detail', detailReq({ cookie: world.operator.cookie, id })))).toBe(200)
  })

  it('ID ausente o inválido: 400 tras autenticar', async () => {
    expect(statusOf(await call('detail', detailReq({ cookie: world.customerA.cookie })))).toBe(400)
    expect(statusOf(await call('detail', detailReq({ cookie: world.customerA.cookie, id: 'bad id' })))).toBe(400)
  })
})

describe('cambio de estado: personal de la tienda del pedido', () => {
  it('owner y operator de la tienda avanzan el estado', async () => {
    const id = await placeOrder(world.customerB)
    const confirmed = await call('status', statusReq({ cookie: world.owner.cookie, id, body: { status: 'confirmed' } }))
    expect(statusOf(confirmed)).toBe(200)
    expect(headerOf(confirmed, 'Cache-Control')).toContain('no-store')

    const preparing = await call('status', statusReq({ cookie: world.operator.cookie, id, body: { status: 'preparing' } }))
    expect(statusOf(preparing)).toBe(200)
    expect((await storedOrder(id))?.status).toBe('preparing')
  })

  it('el cliente, incluso dueño, recibe 403 y el estado no cambia', async () => {
    const id = await placeOrder(world.customerB)
    for (const actor of [world.customerA, world.customerB]) {
      const res = await call('status', statusReq({ cookie: actor.cookie, id, body: { status: 'cancelled' } }))
      expect(statusOf(res)).toBe(403)
      expect(bodyOf(res)).toEqual(forbidden)
    }
    expect((await storedOrder(id))?.status).toBe('received')
  })

  it('personal de otra tienda recibe 404 como si no existiera y no modifica nada', async () => {
    const id = await placeOrder(world.customerB)
    const res = await call('status', statusReq({ cookie: world.foreignOwner.cookie, id }))
    expect(statusOf(res)).toBe(404)
    expect(bodyOf(res)).toEqual(notFound(id))
    expect((await storedOrder(id))?.status).toBe('received')
  })

  it('transición ilegal sigue respondiendo 400 para personal autorizado', async () => {
    const id = await placeOrder(world.customerB)
    const res = await call('status', statusReq({ cookie: world.owner.cookie, id, body: { status: 'delivered' } }))
    expect(statusOf(res)).toBe(400)
  })
})

describe('origen, método y cuerpo', () => {
  it('mutaciones sin origen o con origen ajeno: 403 antes de leer sesión o cuerpo', async () => {
    const id = await placeOrder(world.customerA)
    for (const origin of [undefined, 'https://evil.example', `${HTTP_ORIGIN}.evil.example`]) {
      const create = await call('create', createReq({ cookie: world.customerA.cookie, headers: { origin } }))
      expect(statusOf(create)).toBe(403)
      expect(bodyOf(create)).toMatchObject({ error: 'FORBIDDEN_ORIGIN' })

      const status = await call('status', statusReq({ cookie: world.owner.cookie, id, headers: { origin } }))
      expect(statusOf(status)).toBe(403)
    }
    expect((await storedOrder(id))?.status).toBe('received')
  })

  it('la lectura no exige Origin (navegación same-origin) pero sí sesión', async () => {
    const id = await placeOrder(world.customerA)
    expect(statusOf(await call('detail', detailReq({ cookie: world.customerA.cookie, id, headers: { origin: undefined } })))).toBe(200)
  })

  it('métodos no admitidos: 405 con Allow y sin caché', async () => {
    const cases: [HandlerName, string, string][] = [
      ['create', 'GET', 'POST'],
      ['detail', 'DELETE', 'GET'],
      ['status', 'POST', 'PATCH'],
    ]
    for (const [name, method, allow] of cases) {
      const res = await call(name, withQuery(authRequest({ method }), UNKNOWN_ID))
      expect(statusOf(res)).toBe(405)
      expect(headerOf(res, 'Allow')).toBe(allow)
      expect(headerOf(res, 'Cache-Control')).toContain('no-store')
    }
  })

  it('Content-Type no JSON (415) y cuerpo excesivo (413)', async () => {
    const wrongType = await call('create', createReq({ cookie: world.customerA.cookie, headers: { 'content-type': 'text/plain' } }))
    expect(statusOf(wrongType)).toBe(415)

    const oversized = await call(
      'create',
      withQuery(authRequest({ body: validPickupRequest(), contentLength: 64 * 1024, headers: { cookie: world.customerA.cookie } })),
    )
    expect(statusOf(oversized)).toBe(413)
  })
})
