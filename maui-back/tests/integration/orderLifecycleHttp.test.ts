import { randomUUID } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { orderDtoSchema, orderListResponseSchema, type OrderDto } from '../../../shared/contracts/index.js'
import type { CatalogProduct } from '../../src/domain/catalog/Catalog.js'
import type { OrdersRepository } from '../../src/domain/orders/OrdersRepository.js'
import { createStaffAccount } from '../../src/usecases/auth/createStaffAccount.js'
import { HTTP_ORIGIN, HTTP_SECRET, authRequest, bodyOf, cookiePair, mockResponse, statusOf, type MockResponse } from '../auth/httpFixture.js'
import { internalOrder } from '../contratos/fixtures.js'
import { initializeOrderCatalog } from '../orders/creationFixture.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

/**
 * Ciclo T-12 por HTTP con los handlers reales, sesión/scrypt/JWT reales y el adapter que fija
 * `DB_DRIVER`: memory y PostgreSQL embebido (SQL de producción sobre el transporte Neon redirigido).
 * Las comprobaciones SQL leen la fila directamente, independientes del adapter. No contacta Neon
 * ni Vercel: no acredita el smoke cloud.
 */

const handlers = {
  register: () => import('../../../api/auth/register.js'),
  login: () => import('../../../api/auth/login.js'),
  orders: () => import('../../../api/orders/index.js'),
  detail: () => import('../../../api/orders/[id].js'),
  status: () => import('../../../api/orders/[id]/status.js'),
}

async function call(name: keyof typeof handlers, req: VercelRequest): Promise<MockResponse> {
  const { default: handler } = await handlers[name]()
  const res = mockResponse()
  await handler(req, res as unknown as VercelResponse)
  return res
}

interface Actor {
  id: string
  cookie: string
}

type Body = Record<string, unknown>

const STORE = 'leche-y-miel'
const FOREIGN_STORE = 'otra-tienda'

describe.each(['memory', 'postgres'] as const)('ciclo de pedido T-12 por HTTP (%s)', (driver) => {
  let embedded: EmbeddedPostgres | undefined
  let orders: OrdersRepository
  const world = {} as { customer: Actor; other: Actor; owner: Actor; operator: Actor; foreign: Actor }

  type RequestHeaders = Record<string, string | undefined>
  const request = (method: string, { cookie, id, body, headers }: { cookie?: string; id?: string; body?: unknown; headers?: RequestHeaders | undefined }) =>
    Object.assign(
      authRequest({ method, body, headers: { cookie, ...(body === undefined ? { 'content-type': undefined } : {}), ...headers } }),
      { query: id === undefined ? {} : { id } },
    )

  const place = async (actor: Actor, body: Body, key = randomUUID()): Promise<string> => {
    const res = await call('orders', request('POST', { cookie: actor.cookie, body: { userId: actor.id, ...body }, headers: { 'idempotency-key': key } }))
    expect(statusOf(res), JSON.stringify(bodyOf(res))).toBe(201)
    return (bodyOf(res) as { orderId: string }).orderId
  }
  const status = (actor: Actor, id: string, body: Body, headers?: RequestHeaders) =>
    call('status', request('PATCH', { cookie: actor.cookie, id, body, headers }))
  const items = (actor: Actor, id: string, body: Body, headers?: RequestHeaders) =>
    call('detail', request('PATCH', { cookie: actor.cookie, id, body, headers }))
  const read = async (actor: Actor, id: string): Promise<OrderDto> => {
    const res = await call('detail', request('GET', { cookie: actor.cookie, id }))
    expect(statusOf(res)).toBe(200)
    return orderDtoSchema.parse(bodyOf(res))
  }
  const ok = (res: MockResponse): OrderDto => {
    expect(statusOf(res), JSON.stringify(bodyOf(res))).toBe(200)
    return orderDtoSchema.parse(bodyOf(res))
  }
  /** El servidor siempre envía la versión; el contrato la deja opcional solo por datos demo. */
  const versionOf = (dto: OrderDto): number => {
    if (dto.version === undefined) throw new Error('Respuesta sin versión')
    return dto.version
  }
  const errorOf = (res: MockResponse) => bodyOf(res) as { error: string; message: string; issues?: { path: string }[] }
  /** Avanza por la máquina común con la versión que devuelve cada respuesta. */
  const advance = async (id: string, steps: string[]): Promise<OrderDto> => {
    let current = await read(world.operator, id)
    for (const next of steps) current = ok(await status(world.operator, id, { status: next, expectedVersion: current.version }))
    return current
  }
  /** Fila tal como quedó en la BD (solo PostgreSQL), leída sin el adapter. */
  const row = async (id: string) => {
    if (!embedded) return undefined
    const { rows } = await embedded.pg.query<Record<string, unknown>>(
      `select status, total, final_total, shipping_cost, version, updated_by, items, original_items, item_adjustments, cancellation_reason,
              cancelled_at is not null as has_cancelled_at, created_at < updated_at as updated_after_created
         from orders where id = $1`, [id])
    return rows[0]
  }

  const pickup: Body = {
    items: [{ id: 'prod_leche', qty: 2 }, { id: 'prod_carne', qty: 1, kilosRequested: 1.5 }],
    substitutionPreference: 'similar', deliveryType: 'pickup', deliveryData: {},
    customerName: 'Ana Pérez', customerPhone: '300 123 4567',
  }
  const delivery: Body = {
    ...pickup, items: [{ id: 'prod_leche', qty: 2 }], deliveryType: 'delivery', deliveryData: { address: 'Calle 8 # 5-32' },
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

    const { getRepositories } = await import('../../src/infra/factory.js')
    const { getAuthRuntime } = await import('../../src/infra/auth/factory.js')
    const { initializeStore } = await import('../../src/usecases/store/initializeStore.js')
    const { createCategory } = await import('../../src/usecases/catalog/manageCategories.js')
    const repositories = await getRepositories()
    const { deps } = await getAuthRuntime()
    orders = repositories.orders
    const fixture = { ...repositories, clock: deps.clock }
    const { category } = await initializeOrderCatalog(fixture)

    const base = (await repositories.catalog.findProduct(STORE, 'prod_leche')) as CatalogProduct
    const product = (overrides: Partial<CatalogProduct>) => repositories.catalog.createProduct({ ...base, categoryId: category.id, ...overrides })
    await product({ id: 'prod_queso', name: 'Queso campesino', price: 9000, unit: '500 g' })
    await product({ id: 'prod_pollo', name: 'Pechuga de pollo', price: 4990, unit: 'Por Kilogramo', isVariableWeight: true })
    await product({ id: 'prod_agotado', name: 'Arepa', price: 2000, unit: '1 paquete', inStock: false })
    await initializeStore(fixture, { storeId: FOREIGN_STORE })
    const foreignCategory = await createCategory(fixture, { id: 'owner_ajeno', role: 'owner', storeId: FOREIGN_STORE }, { name: 'Ajena' })
    await repositories.catalog.createProduct({ ...base, id: 'prod_ajeno', storeId: FOREIGN_STORE, categoryId: foreignCategory.id, name: 'Ajeno' })

    const register = async (name: string, phone: string): Promise<Actor> => {
      const res = await call('register', authRequest({ body: { name, phone, password: 'clave-cliente-segura' } }))
      expect(statusOf(res)).toBe(201)
      return { id: (bodyOf(res) as { account: { id: string } }).account.id, cookie: cookiePair(res) }
    }
    const staff = async (role: 'owner' | 'operator', email: string, storeId: string): Promise<Actor> => {
      const password = 'clave-staff-segura-1'
      const account = await createStaffAccount(deps, { role, name: 'Personal', email, storeId, password })
      const res = await call('login', authRequest({ body: { method: 'email', email, password } }))
      expect(statusOf(res)).toBe(200)
      return { id: account.id, cookie: cookiePair(res) }
    }
    world.customer = await register('Ana Pérez', '300 123 4567')
    world.other = await register('Beto Ruiz', '300 765 4321')
    world.owner = await staff('owner', 'duena@maui.test', STORE)
    world.operator = await staff('operator', 'operador@maui.test', STORE)
    world.foreign = await staff('owner', 'ajena@otra.test', FOREIGN_STORE)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    if (embedded) await embedded.close()
  })

  it('retiro: preparación, pesos reales, sustitución, total final y entrega persistidos', async () => {
    const id = await place(world.customer, pickup)
    const created = await read(world.operator, id)
    // 2 × 4500 + round(22000 × 1,5) = 42000; retiro sin envío.
    expect(created).toMatchObject({ status: 'received', version: 1, estimatedTotal: 42000, shippingCost: 0 })
    expect(created).not.toHaveProperty('finalTotal')

    const preparing = await advance(id, ['confirmed', 'preparing'])
    expect(preparing).toMatchObject({ status: 'preparing', version: 3 })

    const notWeighed = await status(world.operator, id, { status: 'ready', expectedVersion: 3 })
    expect(statusOf(notWeighed)).toBe(400)
    expect(errorOf(notWeighed).issues?.map((issue) => issue.path)).toEqual(['items.1.kilosReal'])

    const edited = ok(await items(world.owner, id, {
      expectedVersion: 3,
      changes: [
        { type: 'weight', itemId: 'prod_carne', kilosReal: 1.237 },
        { type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 },
      ],
    }))
    // Queso 9000 + round(22000 × 1,237) = 27214 → 36214; la estimación original se conserva.
    expect(edited).toMatchObject({ version: 4, estimatedTotal: 42000, finalTotal: 36214 })
    expect(edited.items).toEqual([
      { id: 'prod_queso', name: 'Queso campesino', unit: '500 g', priceAtMoment: 9000, is_variable_weight: false, qty: 1, substitutedFor: 'prod_leche' },
      { id: 'prod_carne', name: 'Carne molida', unit: 'Por Kilogramo', priceAtMoment: 22000, is_variable_weight: true, qty: 1, kilosRequested: 1.5, kilosReal: 1.237 },
    ])
    expect(edited.originalItems?.map(({ id: item, qty }) => [item, qty])).toEqual([['prod_leche', 2], ['prod_carne', 1]])

    const ready = ok(await status(world.operator, id, { status: 'ready', expectedVersion: 4 }))
    expect(ready).toMatchObject({ status: 'ready', version: 5, finalTotal: 36214 })
    expect(statusOf(await status(world.operator, id, { status: 'in_delivery', expectedVersion: 5 }))).toBe(400)
    expect(statusOf(await items(world.operator, id, { expectedVersion: 5, changes: [{ type: 'remove', itemId: 'prod_queso' }] }))).toBe(400)

    const delivered = ok(await status(world.owner, id, { status: 'delivered', expectedVersion: 5 }))
    expect(delivered).toMatchObject({ status: 'delivered', version: 6, finalTotal: 36214, estimatedTotal: 42000 })

    const customerView = await read(world.customer, id)
    expect(customerView).toEqual(delivered)
    expect(JSON.stringify(customerView)).not.toContain(world.owner.id)

    expect(await row(id) ?? { status: 'delivered' }).toMatchObject(driver === 'postgres'
      ? { status: 'delivered', total: 42000, final_total: 36214, shipping_cost: 0, version: 6, updated_by: world.owner.id,
          cancellation_reason: null, has_cancelled_at: false, updated_after_created: true }
      : { status: 'delivered' })
  })

  it('terminales inmutables: entregado y cancelado rechazan transiciones y cambios de ítems', async () => {
    const delivered = await place(world.customer, delivery)
    const done = await advance(delivered, ['confirmed', 'preparing', 'ready', 'delivered'])
    const cancelledId = await place(world.customer, delivery)
    const cancelled = ok(await status(world.operator, cancelledId, { status: 'cancelled', expectedVersion: 1, reason: 'Cliente desistió por teléfono' }))

    for (const order of [done, cancelled]) {
      for (const next of ['received', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered']) {
        expect(statusOf(await status(world.owner, order.orderId, { status: next, expectedVersion: order.version }))).toBe(400)
      }
      expect(statusOf(await status(world.owner, order.orderId, { status: 'cancelled', expectedVersion: order.version, reason: 'Otro motivo' }))).toBe(400)
      expect(statusOf(await items(world.owner, order.orderId, { expectedVersion: order.version, changes: [{ type: 'remove', itemId: 'prod_leche' }] }))).toBe(400)
      expect(await read(world.owner, order.orderId)).toEqual(order)
    }
  })

  it('domicilio: en camino opcional; no se cancela en camino; cancelar exige motivo y lo guarda', async () => {
    const id = await place(world.customer, delivery)
    // Solo peso fijo: ready fija el total final = ítems + envío cotizado (9000 + 3000).
    const ready = await advance(id, ['confirmed', 'preparing', 'ready'])
    expect(ready).toMatchObject({ finalTotal: 12000, estimatedTotal: 12000, shippingCost: 3000 })
    const onTheWay = ok(await status(world.operator, id, { status: 'in_delivery', expectedVersion: ready.version }))
    expect(statusOf(await status(world.operator, id, { status: 'cancelled', expectedVersion: onTheWay.version, reason: 'No estaba en casa' }))).toBe(400)
    expect(ok(await status(world.operator, id, { status: 'delivered', expectedVersion: onTheWay.version })).status).toBe('delivered')

    const other = await place(world.customer, delivery)
    const confirmed = await advance(other, ['confirmed'])
    for (const body of [{ status: 'cancelled', expectedVersion: confirmed.version }, { status: 'cancelled', expectedVersion: confirmed.version, reason: '  no  ' }]) {
      const res = await status(world.operator, other, body)
      expect(statusOf(res)).toBe(400)
      expect(errorOf(res).issues?.map((issue) => issue.path)).toEqual(['reason'])
    }
    const cancelled = ok(await status(world.operator, other, { status: 'cancelled', expectedVersion: confirmed.version, reason: '  Producto agotado y cliente sin respuesta  ' }))
    expect(cancelled).toMatchObject({ status: 'cancelled', cancellationReason: 'Producto agotado y cliente sin respuesta', estimatedTotal: 12000 })
    expect(cancelled.cancelledAt).toBe(cancelled.updatedAt)
    expect(await row(other) ?? {}).toMatchObject(driver === 'postgres'
      ? { status: 'cancelled', cancellation_reason: 'Producto agotado y cliente sin respuesta', has_cancelled_at: true, updated_by: world.operator.id }
      : {})
  })

  it('permisos: cliente 403 (incluso dueño), otra tienda 404, sin sesión 401 y origen ajeno 403; nada cambia', async () => {
    const id = await place(world.customer, pickup)
    const before = await read(world.operator, id)
    const statusBody = { status: 'cancelled', expectedVersion: 1, reason: 'Ya no lo quiero' }
    const itemsBody = { expectedVersion: 1, changes: [{ type: 'remove', itemId: 'prod_leche' }] }
    for (const actor of [world.customer, world.other]) {
      for (const res of [await status(actor, id, statusBody), await items(actor, id, itemsBody)]) {
        expect(statusOf(res)).toBe(403)
        expect(errorOf(res).error).toBe('FORBIDDEN')
      }
    }
    for (const res of [await status(world.foreign, id, statusBody), await items(world.foreign, id, itemsBody)]) {
      expect(statusOf(res)).toBe(404)
      expect(errorOf(res)).toEqual({ error: 'NOT_FOUND', message: `Order ${id} not found` })
    }
    const anonymous = { id: 'anon', cookie: '' }
    expect(statusOf(await status(anonymous, id, statusBody))).toBe(401)
    expect(statusOf(await items(anonymous, id, itemsBody))).toBe(401)
    for (const origin of [undefined, 'https://evil.example']) {
      expect(statusOf(await status(world.owner, id, { status: 'confirmed', expectedVersion: 1 }, { origin }))).toBe(403)
      expect(statusOf(await items(world.owner, id, itemsBody, { origin }))).toBe(403)
    }
    expect(statusOf(await items(world.owner, id, itemsBody, { 'content-type': 'text/plain' }))).toBe(415)
    expect(await read(world.operator, id)).toEqual(before)
  })

  it('validación: pesos, duplicados, sustitutos de otra tienda/agotados, precios del request y preferencia remove', async () => {
    const id = await place(world.customer, pickup)
    const current = await advance(id, ['confirmed', 'preparing'])
    const expectedVersion = current.version
    const invalid: [Body[], string[]][] = [
      [[{ type: 'weight', itemId: 'prod_leche', kilosReal: 1 }], ['changes.0.kilosReal']],
      [[{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.2345 }], ['changes.0.kilosReal']],
      [[{ type: 'weight', itemId: 'prod_carne', kilosReal: 0 }], ['changes.0.kilosReal']],
      [[{ type: 'weight', itemId: 'prod_carne', kilosReal: 101 }], ['changes.0.kilosReal']],
      [[{ type: 'weight', itemId: 'prod_carne', kilosReal: 1 }, { type: 'weight', itemId: 'prod_carne', kilosReal: 2 }], ['changes.1.itemId']],
      [[{ type: 'weight', itemId: 'prod_inexistente', kilosReal: 1 }], ['changes.0.itemId']],
      [[{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_ajeno', qty: 1 }], ['changes.0.productId']],
      [[{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_agotado', qty: 1 }], ['changes.0.productId']],
      [[{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_carne', qty: 1 }], ['changes.0.productId']],
      [[{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1, priceAtMoment: 1 }], ['changes.0']],
      [[{ type: 'remove', itemId: 'prod_leche' }, { type: 'remove', itemId: 'prod_carne' }], ['changes']],
    ]
    for (const [changes, paths] of invalid) {
      const res = await items(world.operator, id, { expectedVersion, changes })
      expect(statusOf(res), JSON.stringify(changes)).toBe(400)
      expect(errorOf(res).issues?.map((issue) => issue.path), JSON.stringify(changes)).toEqual(paths)
    }
    expect(statusOf(await items(world.operator, id, { expectedVersion, changes: [{ type: 'remove', itemId: 'prod_leche' }], storeId: FOREIGN_STORE }))).toBe(400)
    expect(await read(world.operator, id)).toEqual(current)

    const noReplacement = await place(world.customer, { ...pickup, substitutionPreference: 'remove' })
    const prepared = await advance(noReplacement, ['confirmed', 'preparing'])
    const denied = await items(world.operator, noReplacement, { expectedVersion: prepared.version, changes: [{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }] })
    expect(errorOf(denied).issues?.map((issue) => issue.path)).toEqual(['changes.0.type'])
    const removed = ok(await items(world.operator, noReplacement, { expectedVersion: prepared.version, changes: [{ type: 'remove', itemId: 'prod_leche' }] }))
    expect(removed.items.map((item) => item.id)).toEqual(['prod_carne'])
    expect(removed).not.toHaveProperty('finalTotal')
  })

  it('concurrencia: dos cambios con la misma versión → uno 200 y otro 409, sin pisar datos ni doble transición', async () => {
    const id = await place(world.customer, pickup)
    const prepared = await advance(id, ['confirmed', 'preparing'])
    const weights = await Promise.all([1.1, 1.9].map((kilosReal) =>
      items(world.operator, id, { expectedVersion: prepared.version, changes: [{ type: 'weight', itemId: 'prod_carne', kilosReal }] })))
    expect(weights.map(statusOf).sort()).toEqual([200, 409])
    const winner = orderDtoSchema.parse(bodyOf(weights.find((res) => statusOf(res) === 200)!))
    expect(errorOf(weights.find((res) => statusOf(res) === 409)!).error).toBe('ORDER_VERSION_CONFLICT')
    expect(await read(world.owner, id)).toEqual(winner)
    expect(versionOf(winner)).toBe(versionOf(prepared) + 1)

    const transitions = await Promise.all([
      status(world.operator, id, { status: 'ready', expectedVersion: winner.version }),
      status(world.owner, id, { status: 'cancelled', expectedVersion: winner.version, reason: 'Cancelación simultánea' }),
    ])
    expect(transitions.map(statusOf).sort()).toEqual([200, 409])
    const after = await read(world.owner, id)
    expect(versionOf(after)).toBe(versionOf(winner) + 1)
    expect(['ready', 'cancelled']).toContain(after.status)
  })

  it('carrera entre lectura y escritura: el UPDATE condicional rechaza la segunda escritura (409)', async () => {
    const id = await place(world.customer, pickup)
    const prepared = await advance(id, ['confirmed', 'preparing'])
    const save = orders.saveChange.bind(orders)
    // Otro operador confirma su peso justo después de que esta request leyó el pedido.
    vi.spyOn(orders, 'saveChange').mockImplementationOnce(async (change) => {
      const competitor = { ...change.next, items: change.next.items.map((item) => (item.id === 'prod_carne' ? { ...item, kilosReal: 1.5 } : item)) }
      expect(await save({ ...change, next: competitor })).not.toBeNull()
      return save(change)
    })
    const res = await items(world.operator, id, { expectedVersion: prepared.version, changes: [{ type: 'weight', itemId: 'prod_carne', kilosReal: 2 }] })
    expect(statusOf(res)).toBe(409)
    const stored = await read(world.owner, id)
    expect(stored.items[1]?.kilosReal).toBe(1.5)
    expect(versionOf(stored)).toBe(versionOf(prepared) + 1)
  })

  it('T-10/T-11 intactos: el reintento devuelve la confirmación original y el listado expone la versión', async () => {
    const key = randomUUID()
    const id = await place(world.other, delivery, key)
    await advance(id, ['confirmed'])
    const retry = await call('orders', request('POST', { cookie: world.other.cookie, body: { userId: world.other.id, ...delivery }, headers: { 'idempotency-key': key } }))
    expect(statusOf(retry)).toBe(201)
    expect(bodyOf(retry)).toEqual({ orderId: id, status: 'received', estimatedTotal: 12000 })

    const list = await call('orders', Object.assign(request('GET', { cookie: world.other.cookie }), { query: { status: 'confirmed' } }))
    expect(statusOf(list)).toBe(200)
    const page = orderListResponseSchema.parse(bodyOf(list))
    expect(page.items.map((item) => [item.orderId, item.version])).toEqual([[id, 2]])
  })

  it('call_me: quitar o sustituir exige la constancia de contacto del personal y queda registrada', async () => {
    const id = await place(world.customer, { ...pickup, substitutionPreference: 'call_me' })
    const prepared = await advance(id, ['confirmed', 'preparing'])
    const substitute = { type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }
    for (const change of [substitute, { type: 'remove', itemId: 'prod_leche' }]) {
      const res = await items(world.operator, id, { expectedVersion: prepared.version, changes: [change] })
      expect(statusOf(res)).toBe(400)
      expect(errorOf(res).issues?.map((issue) => issue.path)).toEqual(['changes.0.customerContacted'])
    }
    expect(await read(world.operator, id)).toEqual(prepared)

    const changed = ok(await items(world.operator, id, { expectedVersion: prepared.version, changes: [{ ...substitute, customerContacted: true }] }))
    expect(changed.items[0]).toMatchObject({ id: 'prod_queso', substitutedFor: 'prod_leche' })
    expect(JSON.stringify(changed)).not.toContain('customerContacted')
    expect(JSON.stringify(changed)).not.toContain(world.operator.id)
    const stored = await orders.findById(id)
    expect(stored?.itemAdjustments).toEqual([
      { type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', customerContacted: true, by: world.operator.id, at: changed.updatedAt },
    ])
    if (embedded) expect((await row(id))?.item_adjustments).toEqual(stored?.itemAdjustments)
  })

  it('legacy en ready/in_delivery: fijo sin total llega a entregado con total; variable sin peso no se entrega', async () => {
    const legacy = (id: string, status: 'ready' | 'in_delivery', variable: boolean) => {
      const { shippingCost: _shipping, finalTotal: _final, ...order } = internalOrder({
        id, status, customerId: world.customer.id, storeId: STORE, createdAt: '2026-09-01T10:00:00.123Z', updatedAt: '2026-09-01T10:00:00.123Z',
        ...(variable ? {} : { items: [{ id: 'prod_leche', name: 'Leche entera 1L', qty: 2, priceAtMoment: 4500 }], estimatedTotal: 9000 }),
      })
      return orders.create(order)
    }
    const fixed = await legacy('01HJLEGACYFIJOREADY000T12', 'ready', false)
    const onTheWay = ok(await status(world.operator, fixed.id, { status: 'in_delivery', expectedVersion: 1 }))
    expect(onTheWay).toMatchObject({ finalTotal: 9000, estimatedTotal: 9000 })
    expect(ok(await status(world.operator, fixed.id, { status: 'delivered', expectedVersion: 2 }))).toMatchObject({ status: 'delivered', finalTotal: 9000 })

    for (const [id, from, next] of [['01HJLEGACYVARREADY0000T12', 'ready', 'delivered'], ['01HJLEGACYVARENCAMINOT12', 'in_delivery', 'delivered']] as const) {
      await legacy(id, from, true)
      const res = await status(world.operator, id, { status: next, expectedVersion: 1 })
      expect(statusOf(res)).toBe(400)
      expect(errorOf(res).issues?.map((issue) => issue.path)).toEqual(['items.1.kilosReal'])
      const unchanged = await read(world.operator, id)
      expect(unchanged).toMatchObject({ status: from, version: 1 })
      expect(unchanged).not.toHaveProperty('finalTotal')
    }
    if (embedded) {
      const { rows } = await embedded.pg.query(`select count(*)::int as n from orders where status = 'delivered' and final_total is null and id like '01HJLEGACY%'`)
      expect(rows[0]).toEqual({ n: 0 })
    }
  })

  // Requieren SQL directo sobre la BD: solo se registran con PostgreSQL embebido.
  if (driver !== 'postgres') return

  it('sustituto cuyo producto cambia antes de confirmar: 409 y el reintento usa el precio vigente', async () => {
    const id = await place(world.customer, pickup)
    const prepared = await advance(id, ['confirmed', 'preparing'])
    const save = orders.saveChange.bind(orders)
    vi.spyOn(orders, 'saveChange').mockImplementationOnce(async (change) => {
      await embedded!.pg.query(`update catalog_products set price = 9500, version = version + 1 where id = 'prod_queso'`)
      return save(change)
    })
    const body = { expectedVersion: prepared.version, changes: [{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }] }
    expect(statusOf(await items(world.operator, id, body))).toBe(409)
    expect(await read(world.operator, id)).toEqual(prepared)

    const retried = ok(await items(world.operator, id, body))
    expect(retried.items[0]).toMatchObject({ id: 'prod_queso', priceAtMoment: 9500 })
  })

  it('fila legacy previa a T-04: se edita con versión 1 y se reescribe en formato canónico', async () => {
    const id = '01HJLEGACY00000000000000T12'
    await embedded!.pg.query(
      `insert into orders (id, store_id, customer_id, customer_name, customer_phone, items, total, status, delivery_mode,
         delivery_address, substitution_preference, created_at, updated_at)
       values ($1, $2, $3, 'Cliente legacy', '+57 300 111 2222', $4::jsonb, 42000, 'preparing', 'delivery', 'Calle 1',
         'ask', '2026-09-01 10:00:00.123456+00', '2026-09-01 10:00:00.123456+00')`,
      [id, STORE, world.customer.id, JSON.stringify([
        { productId: 'prod_leche', name: 'Leche entera 1L', priceAtMoment: 4500, quantity: 2, isVariableWeight: false },
        { productId: 'prod_carne', name: 'Carne molida', priceAtMoment: 22000, kilos: 1.5, isVariableWeight: true },
      ])],
    )
    const legacy = await read(world.operator, id)
    expect(legacy).toMatchObject({ version: 1, estimatedTotal: 42000, createdAt: '2026-09-01T10:00:00.123Z' })
    expect(legacy).not.toHaveProperty('shippingCost')

    const weighed = ok(await items(world.operator, id, { expectedVersion: 1, changes: [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.5 }] }))
    // Sin envío guardado (legacy): el total final suma solo ítems, como su estimación legacy.
    expect(weighed).toMatchObject({ version: 2, estimatedTotal: 42000, finalTotal: 42000 })
    const stored = await row(id)
    expect(stored).toMatchObject({ total: 42000, shipping_cost: null, version: 2, updated_after_created: true })
    expect(stored?.items).toEqual([
      { id: 'prod_leche', name: 'Leche entera 1L', priceAtMoment: 4500, qty: 2 },
      { id: 'prod_carne', name: 'Carne molida', priceAtMoment: 22000, qty: 1, is_variable_weight: true, kilosRequested: 1.5, kilosReal: 1.5 },
    ])
    expect(ok(await status(world.operator, id, { status: 'ready', expectedVersion: 2 })).status).toBe('ready')
  })

  it('CHECK de 0006: versión positiva y motivo solo con fecha en pedidos cancelados, aun por SQL directo', async () => {
    const id = await place(world.customer, pickup)
    for (const statement of [
      `update orders set version = 0 where id = '${id}'`,
      `update orders set cancellation_reason = 'Motivo suelto', cancelled_at = now() where id = '${id}'`,
      `update orders set status = 'cancelled', cancellation_reason = 'Sin fecha' where id = '${id}'`,
    ]) {
      await expect(embedded!.pg.query(statement), statement).rejects.toMatchObject({ code: '23514' })
    }
  })
})
