import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import {
  apiErrorSchema, auditListResponseSchema, authSessionResponseSchema, orderConfirmationSchema, orderDtoSchema, orderListResponseSchema,
  publicCatalogResponseSchema, storeDtoSchema, type OrderDto,
} from '../../../shared/contracts/index.js'

/**
 * Smoke de contención entre conexiones reales. PGlite serializa las conexiones: la reserva de la
 * clave de idempotencia (lock advisory), la cuota por hora, el CAS por versión y la auditoría en la
 * misma sentencia solo se prueban contra el Postgres de test con peticiones HTTP realmente
 * paralelas (cada Function abre su propia conexión). Crea un cliente propio y pedidos de recogida
 * que cancela al terminar; no toca el catálogo, la tienda ni las cuentas del seed. Solo se ejecuta
 * contra un despliegue que declare `environment: test`.
 *
 * Es una mutación acotada de la BD de test: la ejecuta quien coordina el ambiente, no la suite
 * automática (`npm test` solo la ejercita contra los handlers en proceso para validar el guion).
 */

export interface ContentionResponse {
  status: number
  json: unknown
  /**  de la cookie de sesión fijada por la respuesta, si la hubo. */
  cookie?: string | undefined
  retryAfter?: string | undefined
}

/** Como el cliente del smoke de lectura, pero con cabeceras de petición (Idempotency-Key) y Retry-After. */
export interface ContentionClient {
  request(method: 'GET' | 'PATCH' | 'POST', path: string, init?: { cookie?: string | undefined; body?: unknown; headers?: Record<string, string> }): Promise<ContentionResponse>
}

export interface ContentionCheck {
  name: string
  ok: boolean
  detail?: string
}

export interface ContentionCredentials {
  owner: { email: string; password: string }
  operator: { email: string; password: string }
}

export interface ContentionOptions {
  /** Peticiones simultáneas por escenario (2–20). */
  parallelism?: number
  /** Escenario de cuota horaria: 24 pedidos paralelos de un cliente nuevo (deja 20 pedidos que se cancelan). */
  quota?: boolean
  runId?: string
}

export interface ContentionReport {
  runId: string
  ok: boolean
  /** Motivo por el que no se ejecutó nada (entorno, tienda cerrada o catálogo sin productos): no es un fallo. */
  blocked?: string
  checks: ContentionCheck[]
  orders: { created: number; cancelled: number; cancelFailed: number }
}

class ContentionFailure extends Error {}

const expect = (condition: boolean, detail: string): void => {
  if (!condition) throw new ContentionFailure(detail)
}
const statusesOf = (responses: ContentionResponse[]): string => responses.map(response => response.status).sort().join(',')

interface Session { cookie: string; id: string }

export async function runContentionSmoke(client: ContentionClient, credentials: ContentionCredentials, options: ContentionOptions = {}): Promise<ContentionReport> {
  const parallelism = Math.min(20, Math.max(2, options.parallelism ?? 8))
  const runId = options.runId ?? randomBytes(4).toString('hex')
  const checks: ContentionCheck[] = []
  const created: string[] = []
  const report = (extra: Partial<ContentionReport> = {}): ContentionReport => ({
    runId, ok: !extra.blocked && checks.every(check => check.ok), checks, orders: { created: created.length, cancelled: 0, cancelFailed: 0 }, ...extra,
  })
  const run = async (name: string, action: () => Promise<void>): Promise<void> => {
    try {
      await action()
      checks.push({ name, ok: true })
    } catch (error) {
      // Solo mensajes propios: nunca cuerpos de respuesta, cookies ni credenciales.
      checks.push({ name, ok: false, detail: error instanceof ContentionFailure ? error.message : 'Respuesta inesperada o ilegible' })
    }
  }

  const login = async (email: string, password: string): Promise<Session> => {
    const response = await client.request('POST', '/api/auth/login', { body: { method: 'email', email, password } })
    expect(response.status === 200 && response.cookie !== undefined, `login de ${email.split('@')[0]}: estado ${response.status}`)
    return { cookie: response.cookie!, id: authSessionResponseSchema.parse(response.json).account.id }
  }
  const register = async (): Promise<Session & { phone: string }> => {
    const phone = `3${String(randomInt(0, 1e9)).padStart(9, '0')}`
    const response = await client.request('POST', '/api/auth/register', { body: { name: `Contención ${runId}`, phone, password: `${randomBytes(18).toString('base64url')}aA1` } })
    expect(response.status === 201 && response.cookie !== undefined, `registro del cliente de la corrida: estado ${response.status}`)
    return { cookie: response.cookie!, id: authSessionResponseSchema.parse(response.json).account.id, phone: `57${phone}` }
  }

  const health = await client.request('GET', '/api/health')
  const environment = (health.json as { environment?: unknown } | null)?.environment
  if (health.status !== 200 || environment !== 'test') return report({ blocked: 'la API no declara environment: test' })
  const store = storeDtoSchema.parse((await client.request('GET', '/api/store')).json)
  if (!store.availability.isOpen) return report({ blocked: 'la tienda está cerrada: los pedidos serían rechazados; ejecutar en horario o con override abierto autorizado' })
  const catalog = publicCatalogResponseSchema.parse((await client.request('GET', '/api/catalog')).json).products.filter(product => product.inStock)
  const fixed = [...catalog].filter(product => !product.is_variable_weight).sort((a, b) => a.price - b.price)[0]
  const variable = catalog.find(product => product.is_variable_weight)
  if (!fixed || !variable) return report({ blocked: 'el catálogo de test no tiene un producto de peso fijo y uno de peso variable disponibles' })

  let owner!: Session, operator!: Session, customer!: Session & { phone: string }
  try {
    owner = await login(credentials.owner.email, credentials.owner.password)
    operator = await login(credentials.operator.email, credentials.operator.password)
    customer = await register()
  } catch (error) {
    checks.push({ name: 'sesiones de la corrida', ok: false, detail: error instanceof ContentionFailure ? error.message : 'Respuesta inesperada o ilegible' })
    return report()
  }

  const orderBody = (actor: Session & { phone: string }, items: unknown[]) => ({
    userId: actor.id, customerName: `Contención ${runId}`, customerPhone: actor.phone, deliveryType: 'pickup', deliveryData: {}, substitutionPreference: 'similar', items,
  })
  const fixedItems = (qty: number) => [{ id: fixed.id, qty }]
  const mixedItems = [{ id: fixed.id, qty: 1 }, { id: variable.id, qty: 1, kilosRequested: 1 }]
  const place = (actor: Session & { phone: string }, items: unknown[], key: string) =>
    client.request('POST', '/api/orders', { cookie: actor.cookie, body: orderBody(actor, items), headers: { 'idempotency-key': key } })
  const ordersOf = async (actor: Session): Promise<OrderDto[]> => orderListResponseSchema.parse((await client.request('GET', '/api/orders?limit=100', { cookie: actor.cookie })).json).items
  const events = async (orderId: string, action: string) =>
    auditListResponseSchema.parse((await client.request('GET', `/api/audit?entity=order&entityId=${orderId}&action=${action}`, { cookie: owner.cookie })).json).items
  const track = (response: ContentionResponse): string => {
    const { orderId } = orderConfirmationSchema.parse(response.json)
    if (!created.includes(orderId)) created.push(orderId)
    return orderId
  }
  const fire = <T>(count: number, make: (index: number) => Promise<T>): Promise<T[]> => Promise.all(Array.from({ length: count }, (_, index) => make(index)))

  await run(`idempotencia: ${parallelism} POST paralelos con la misma clave e intención crean un solo pedido`, async () => {
    const before = (await ordersOf(customer)).length
    const key = randomUUID()
    const responses = await fire(parallelism, () => place(customer, fixedItems(1), key))
    expect(responses.every(response => response.status === 201), `estados ${statusesOf(responses)}; se esperaba 201 en todos`)
    const ids = new Set(responses.map(track))
    expect(ids.size === 1, `${ids.size} pedidos distintos para una sola clave`)
    const [orderId] = [...ids] as [string]
    expect((await ordersOf(customer)).length === before + 1, 'el cliente tiene más de un pedido nuevo')
    const audit = await events(orderId, 'created')
    expect(audit.length === 1 && audit[0]?.actorId === customer.id, `${audit.length} eventos de creación (esperado 1 del cliente)`)
  })

  await run(`idempotencia: ${parallelism} POST paralelos con la misma clave e intenciones distintas dejan un ganador y 409`, async () => {
    const before = (await ordersOf(customer)).length
    const key = randomUUID()
    const responses = await fire(parallelism, index => place(customer, fixedItems(1 + (index % 2)), key))
    expect(responses.every(response => response.status === 201 || response.status === 409), `estados ${statusesOf(responses)}; se esperaba solo 201/409`)
    const winners = responses.filter(response => response.status === 201)
    expect(winners.length >= 1, 'ningún POST creó el pedido')
    expect(new Set(winners.map(track)).size === 1, 'más de un pedido para una sola clave')
    const rejected = responses.filter(response => response.status === 409)
    expect(rejected.length >= 1 && rejected.every(response => apiErrorSchema.parse(response.json).error === 'IDEMPOTENCY_KEY_REUSED'), 'la intención distinta no recibió IDEMPOTENCY_KEY_REUSED')
    expect((await ordersOf(customer)).length === before + 1, 'la clave reservada generó más de un pedido')
  })

  let contended: string | undefined
  await run(`CAS: ${parallelism} cambios de estado paralelos con la misma versión (owner y operator) dejan un ganador`, async () => {
    const confirmation = await place(customer, mixedItems, randomUUID())
    expect(confirmation.status === 201, `pedido de la prueba: estado ${confirmation.status}`)
    const id = track(confirmation)
    contended = id
    const sessions = [owner, operator]
    const responses = await fire(parallelism, index => client.request('PATCH', `/api/orders/${id}/status`, { cookie: sessions[index % 2]!.cookie, body: { status: 'confirmed', expectedVersion: 1 } }))
    expect(statusesOf(responses) === ['200', ...Array<string>(parallelism - 1).fill('409')].join(','), `estados ${statusesOf(responses)}; se esperaba un 200 y el resto 409`)
    const current = orderDtoSchema.parse((await client.request('GET', `/api/orders/${id}`, { cookie: owner.cookie })).json)
    expect(current.status === 'confirmed' && current.version === 2, `pedido en ${current.status} v${current.version}; esperado confirmed v2`)
    const audit = await events(id, 'status_changed')
    expect(audit.length === 1 && audit[0]?.metadata.previousVersion === 1 && audit[0]?.metadata.version === 2, `${audit.length} eventos de cambio de estado (esperado 1, v1→v2)`)
  })

  await run(`CAS: ${parallelism} pesajes paralelos con la misma versión dejan un ganador y el peso de su petición`, async () => {
    expect(contended !== undefined, 'depende del pedido del escenario anterior')
    const id = contended!
    const preparing = await client.request('PATCH', `/api/orders/${id}/status`, { cookie: owner.cookie, body: { status: 'preparing', expectedVersion: 2 } })
    expect(preparing.status === 200, `paso a preparación: estado ${preparing.status}`)
    const weights = Array.from({ length: parallelism }, (_, index) => 1 + (index + 1) / 100)
    const responses = await fire(parallelism, index => client.request('PATCH', `/api/orders/${id}`, { cookie: owner.cookie, body: { expectedVersion: 3, changes: [{ type: 'weight', itemId: variable.id, kilosReal: weights[index] }] } }))
    expect(statusesOf(responses) === ['200', ...Array<string>(parallelism - 1).fill('409')].join(','), `estados ${statusesOf(responses)}; se esperaba un 200 y el resto 409`)
    const winner = weights[responses.findIndex(response => response.status === 200)]
    const current = orderDtoSchema.parse((await client.request('GET', `/api/orders/${id}`, { cookie: owner.cookie })).json)
    expect(current.version === 4 && current.items.find(item => item.id === variable.id)?.kilosReal === winner, 'el pedido no conserva exactamente el pesaje ganador en v4')
    expect((await events(id, 'items_changed')).length === 1, 'la auditoría no tiene exactamente un evento de ítems')
  })

  if (options.quota) {
    await run('cuota: 24 pedidos paralelos de un cliente nuevo confirman 20 y limitan 4', async () => {
      const burst = await register().catch(() => { throw new ContentionFailure('registro del cliente de cuota rechazado') })
      const responses = await fire(24, () => place(burst, fixedItems(1), randomUUID()))
      for (const response of responses) if (response.status === 201) track(response)
      expect(statusesOf(responses) === [...Array<number>(20).fill(201), ...Array<number>(4).fill(429)].join(','), `estados ${statusesOf(responses)}; se esperaban 20×201 y 4×429`)
      expect(responses.filter(response => response.status === 429).every(response => /^\d{1,7}$/.test(response.retryAfter ?? '')), 'un 429 no trae Retry-After en segundos')
      expect((await ordersOf(burst)).length === 20, 'el cliente de cuota no tiene exactamente 20 pedidos')
    })
  }

  // Limpieza acotada a lo creado por esta corrida: los pedidos quedan cancelados, no pendientes.
  let cancelled = 0, cancelFailed = 0
  for (const id of created) {
    try {
      const current = orderDtoSchema.parse((await client.request('GET', `/api/orders/${id}`, { cookie: owner.cookie })).json)
      if (current.status === 'delivered' || current.status === 'cancelled') continue
      const response = await client.request('PATCH', `/api/orders/${id}/status`, { cookie: owner.cookie, body: { status: 'cancelled', expectedVersion: current.version, reason: `Smoke de contención ${runId}` } })
      if (response.status === 200) cancelled += 1
      else cancelFailed += 1
    } catch {
      cancelFailed += 1
    }
  }
  return report({ orders: { created: created.length, cancelled, cancelFailed } })
}
