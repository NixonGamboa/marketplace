import { sharedProducts } from '../../../../shared/catalog/index.js'
import {
  auditListResponseSchema,
  authSessionResponseSchema,
  orderListResponseSchema,
  publicCatalogResponseSchema,
  type OrderDto,
} from '../../../../shared/contracts/index.js'
import { SEED_CUSTOMERS, SEED_DATASET_VERSION, SEED_ORDERS, SEED_STAFF, finalStatusOf } from './dataset.js'
import type { SeedCredentials } from './runSeed.js'

/**
 * Smoke del seed contra una API desplegada (Preview/Neon dev), solo con lecturas y logins: no
 * crea pedidos (el reloj real puede tener la tienda cerrada) y no consume la cota de
 * intentos fallidos. Verifica identidad/rol/tienda, alcance por cuenta, catálogo, pedidos del dataset
 * y auditoría con actor, con las credenciales de test que llegan por entorno.
 */

export interface SmokeResponse {
  status: number
  json: unknown
  /** `nombre=valor` de la cookie de sesión fijada por la respuesta, si la hubo. */
  cookie?: string | undefined
}

export interface SmokeClient {
  request(method: 'GET' | 'PATCH' | 'POST', path: string, init?: { cookie?: string | undefined; body?: unknown }): Promise<SmokeResponse>
}

export interface SmokeCheck {
  name: string
  ok: boolean
  detail?: string
}

export interface SmokeReport {
  datasetVersion: string
  ok: boolean
  checks: SmokeCheck[]
}

class SmokeFailure extends Error {}

const expect = (condition: boolean, detail: string): void => {
  if (!condition) throw new SmokeFailure(detail)
}

const expectStatus = (response: SmokeResponse, status: number, what: string): void =>
  expect(response.status === status, `${what}: esperado ${status}, recibido ${response.status}`)

/** Sesión abierta: rol y tienda llegan de la cuenta, nunca se asumen. */
interface Session {
  cookie: string
  accountId: string
  role: string
}

const login = async (client: SmokeClient, credential: { email: string } | { phone: string }, password: string): Promise<Session> => {
  const body = 'email' in credential
    ? { method: 'email', email: credential.email, password }
    : { method: 'phone', phone: credential.phone, password }
  const response = await client.request('POST', '/api/auth/login', { body })
  expectStatus(response, 200, 'login')
  expect(response.cookie !== undefined, 'login sin cookie de sesión')
  const parsed = authSessionResponseSchema.parse(response.json)
  return { cookie: response.cookie as string, accountId: parsed.account.id, role: parsed.account.role }
}

const listOrders = async (client: SmokeClient, session: Session): Promise<OrderDto[]> => {
  const response = await client.request('GET', '/api/orders?limit=100', { cookie: session.cookie })
  expectStatus(response, 200, 'listado de pedidos')
  return orderListResponseSchema.parse(response.json).items
}

/** Solo evalúa pedidos que nadie editó (versión = pasos + 1): el personal puede seguir operando el entorno. */
const checkUntouched = (spec: (typeof SEED_ORDERS)[number], order: OrderDto): string | null => {
  if (order.version !== spec.steps.length + 1) return null
  if (order.status !== finalStatusOf(spec)) return `${spec.id}: estado ${order.status}, esperado ${finalStatusOf(spec)}`
  if (order.deliveryType !== spec.request.deliveryType) return `${spec.id}: modalidad inesperada`
  const needsFinal = ['ready', 'in_delivery', 'delivered'].includes(order.status)
  if (needsFinal && order.finalTotal === undefined) return `${spec.id}: falta el total final`
  if (!needsFinal && order.finalTotal !== undefined) return `${spec.id}: total final antes de ready`
  return null
}

export const runSmoke = async (client: SmokeClient, passwords: Required<SeedCredentials>): Promise<SmokeReport> => {
  const checks: SmokeCheck[] = []
  const sessions = new Map<string, Session>()
  const run = async (name: string, action: () => Promise<void>): Promise<void> => {
    try {
      await action()
      checks.push({ name, ok: true })
    } catch (error) {
      // Mensajes propios del smoke: nunca el cuerpo de una respuesta ni credenciales.
      checks.push({ name, ok: false, detail: error instanceof SmokeFailure ? error.message : 'Respuesta inesperada o ilegible' })
    }
  }
  const sessionOf = (key: string): Session => {
    const session = sessions.get(key)
    if (!session) throw new SmokeFailure(`Sin sesión de ${key}`)
    return session
  }

  await run('la API declara entorno de test y base conectada', async () => {
    const health = await client.request('GET', '/api/health')
    expectStatus(health, 200, 'health')
    const body = health.json as { status?: unknown; database?: unknown; environment?: unknown }
    expect(body.environment === 'test', 'el entorno no es de test: no se continúa')
    expect(body.status === 'ok' && body.database === 'connected', 'la base no está conectada')
  })
  if (checks.some(check => !check.ok)) return { datasetVersion: SEED_DATASET_VERSION, ok: false, checks }

  const passwordOf = (key: 'owner' | 'operator') => passwords[key]
  for (const staff of SEED_STAFF) {
    await run(`login ${staff.role}: identidad, rol y tienda`, async () => {
      const session = await login(client, { email: staff.email }, passwordOf(staff.key))
      sessions.set(staff.key, session)
      expect(session.role === staff.role && session.accountId === staff.id, 'identidad o rol distintos del dataset')
    })
  }
  for (const customer of SEED_CUSTOMERS) {
    await run(`login cliente ${customer.key}`, async () => {
      const session = await login(client, { phone: `57${customer.phone}` }, passwords.customer)
      sessions.set(customer.key, session)
      expect(session.role === 'customer' && session.accountId === customer.id, 'identidad o rol distintos del dataset')
    })
  }

  await run('catálogo público con los productos del baseline y un agotado', async () => {
    const response = await client.request('GET', '/api/catalog')
    expectStatus(response, 200, 'catálogo')
    const catalog = publicCatalogResponseSchema.parse(response.json)
    const ids = new Set(catalog.products.map(product => product.id))
    const missing = sharedProducts.filter(product => !ids.has(product.id)).length
    expect(missing === 0, `faltan ${missing} productos del baseline`)
    expect(catalog.products.some(product => product.inStock === false), 'no hay ningún producto agotado visible')
  })

  await run('tienda con cobertura urbana y horario', async () => {
    const response = await client.request('GET', '/api/store')
    expectStatus(response, 200, 'tienda')
    const store = response.json as { delivery?: { coverageNote?: unknown }; weeklySchedule?: unknown }
    expect(typeof store.delivery?.coverageNote === 'string' && store.weeklySchedule !== undefined, 'tienda sin cobertura u horario')
  })

  for (const key of ['owner', 'operator'] as const) {
    await run(`${key}: ve los pedidos del dataset con su estado y totales`, async () => {
      const orders = await listOrders(client, sessionOf(key))
      const byId = new Map(orders.map(order => [order.orderId, order]))
      const problems: string[] = []
      for (const spec of SEED_ORDERS) {
        const order = byId.get(spec.id)
        if (!order) problems.push(`${spec.id}: ausente`)
        else {
          const problem = checkUntouched(spec, order)
          if (problem) problems.push(problem)
        }
      }
      expect(problems.length === 0, problems.join('; '))
    })
  }

  for (const customer of SEED_CUSTOMERS) {
    await run(`cliente ${customer.key}: solo ve sus pedidos`, async () => {
      const orders = await listOrders(client, sessionOf(customer.key))
      expect(orders.length > 0 && orders.every(order => order.userId === customer.id), 'el listado incluye pedidos de otra cuenta')
      const expected = SEED_ORDERS.filter(spec => spec.customer === customer.key).map(spec => spec.id)
      expect(expected.every(id => orders.some(order => order.orderId === id)), 'faltan pedidos propios del dataset')
    })
  }

  await run('un cliente no ve ni muta pedidos ajenos', async () => {
    const own = sessionOf('ana')
    const foreign = SEED_ORDERS.find(spec => spec.customer === 'luis')
    expect(foreign !== undefined, 'dataset sin pedidos de otro cliente')
    const read = await client.request('GET', `/api/orders/${foreign?.id}`, { cookie: own.cookie })
    expectStatus(read, 404, 'lectura de pedido ajeno')
    const mutate = await client.request('PATCH', `/api/orders/${foreign?.id}/status`, {
      cookie: own.cookie, body: { status: 'confirmed', expectedVersion: 1 },
    })
    expectStatus(mutate, 403, 'cambio de estado por un cliente')
  })

  await run('auditoría: personal ve eventos con actor; el cliente recibe 403', async () => {
    const response = await client.request('GET', '/api/audit?entity=order&limit=100', { cookie: sessionOf('owner').cookie })
    expectStatus(response, 200, 'auditoría')
    const events = auditListResponseSchema.parse(response.json).items
    const seeded = new Set(SEED_ORDERS.map(spec => spec.id))
    const ofSeed = events.filter(event => seeded.has(event.entityId))
    expect(ofSeed.length > 0, 'sin eventos de pedidos del dataset')
    expect(ofSeed.every(event => event.actorKind === 'account' && event.actorId !== null), 'eventos de pedidos sin actor de cuenta')
    expect(ofSeed.some(event => event.action === 'status_changed'), 'sin cambios de estado auditados')
    const denied = await client.request('GET', '/api/audit', { cookie: sessionOf('ana').cookie })
    expectStatus(denied, 403, 'auditoría con sesión de cliente')
  })

  await run('catálogo de personal accesible para owner y operator', async () => {
    for (const key of ['owner', 'operator']) {
      const response = await client.request('GET', '/api/catalog/staff', { cookie: sessionOf(key).cookie })
      expectStatus(response, 200, `catálogo de personal (${key})`)
    }
  })

  for (const [key, session] of sessions) {
    await run(`cerrar sesión propia de ${key}`, async () => {
      const response = await client.request('POST', '/api/auth/logout', { cookie: session.cookie })
      expectStatus(response, 204, 'logout')
    })
  }
  return { datasetVersion: SEED_DATASET_VERSION, ok: checks.every(check => check.ok), checks }
}
