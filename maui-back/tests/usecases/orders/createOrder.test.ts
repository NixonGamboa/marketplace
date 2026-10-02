import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOrder } from '../../../src/usecases/orders/createOrder.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import { CatalogRepositoryMemory } from '../../../src/infra/memory/CatalogRepositoryMemory.js'
import { StoreRepositoryMemory } from '../../../src/infra/memory/StoreRepositoryMemory.js'
import { HmacBucketKeyer } from '../../../src/infra/auth/randomIds.js'
import { TestClock, TEST_SECRET } from '../../auth/fixtures.js'
import { AuthorizationError, RateLimitedError } from '../../../src/domain/auth/errors.js'
import { createHash } from 'node:crypto'
import { createOrderRequestSchema } from '../../../../shared/contracts/index.js'
import { ValidationError } from '../../../src/shared/errors.js'
import { toOrderDto } from '../../../src/domain/orders/orderMappers.js'
import { orderDtoSchema } from '../../../../shared/contracts/index.js'
import { validDeliveryRequest, validPickupRequest, variableWeightItem } from '../../contratos/fixtures.js'
import { initializeOrderCatalog } from '../../orders/creationFixture.js'
import { updateStoreSettings } from '../../../src/usecases/store/updateStoreSettings.js'

const customer = { id: 'cust_01', role: 'customer' as const, storeId: null }
const context = { storeId: 'leche-y-miel' }
const keys = new HmacBucketKeyer(TEST_SECRET)

describe('creación autoritativa e idempotente', () => {
  let orders: OrdersRepositoryMemory
  let catalog: CatalogRepositoryMemory
  let store: StoreRepositoryMemory
  let clock = new TestClock(new Date('2026-10-05T15:00:00.000Z'))
  const deps = () => ({ orders, catalog, store, clock, keys })
  const create = (body: unknown = validPickupRequest(), key: unknown = randomUUID(), actor = customer) =>
    createOrder(deps(), actor, body, context, key)
  const alter = async (id: string, patch: Record<string, unknown>) => {
    const product = await catalog.findProduct(context.storeId, id)
    if (!product) throw Error('Missing fixture')
    await catalog.updateProduct({ ...product, ...patch, version: product.version + 1 }, product.version)
  }
  beforeEach(async () => {
    clock = new TestClock(new Date('2026-10-05T15:00:00.000Z'))
    orders = new OrdersRepositoryMemory(); store = new StoreRepositoryMemory()
    catalog = new CatalogRepositoryMemory(id => store.hasStore(id))
    await initializeOrderCatalog(deps())
  })
  it('ignora precios, nombre, flag y envío legacy; conserva snapshot del catálogo', async () => {
    const order = await create({ ...validDeliveryRequest(), shippingCost: 1,
      items: [{ id: 'prod_leche', qty: 2, priceAtMoment: 1, name: 'Manipulado', is_variable_weight: true }] })
    expect(order).toMatchObject({ estimatedTotal: 12000, shippingCost: 3000, customerPhone: '573001234567' })
    expect(order.items[0]).toMatchObject({ name: 'Leche entera 1L', priceAtMoment: 4500, unit: '1 L', is_variable_weight: false })
    expect(order.finalTotal).toBeUndefined()
    expect(orderDtoSchema.safeParse(toOrderDto(order)).success).toBe(true)
  })
  it('acepta solo intención mínima sin campos legacy', async () => {
    const { shippingCost: _omit, ...body } = validPickupRequest()
    expect((await create({ ...body, items: [{ id: 'prod_leche', qty: 2 }] })).estimatedTotal).toBe(9000)
  })
  it('peso variable se deriva del catálogo incluso con flag false y redondea por línea', async () => {
    await alter('prod_carne', { price: 4500 })
    const order = await create({ ...validPickupRequest(), items: [{ id: 'prod_carne', qty: 1, kilosRequested: 0.333, is_variable_weight: false }] })
    expect(order.estimatedTotal).toBe(1499)
    expect(order.items[0]).toMatchObject({ is_variable_weight: true, kilosRequested: 0.333 })
    expect(order.items[0]).not.toHaveProperty('kilosReal')
  })
  it.each([{}, { inStock: false }, { active: false }, { archivedAt: '2026-10-05T14:00:00.000Z' }])('rechaza producto no disponible %j sin crear', async patch => {
    const body = patch && Object.keys(patch).length ? validPickupRequest()
      : { ...validPickupRequest(), items: [{ id: 'no-existe', qty: 1 }] }
    if (Object.keys(patch).length) await alter('prod_leche', patch)
    await expect(create(body)).rejects.toBeInstanceOf(ValidationError)
    expect(await orders.listByStore(context.storeId)).toHaveLength(0)
  })
  it.each([{ id: 'prod_carne', qty: 1 }, { id: 'prod_carne', qty: 2, kilosRequested: 1 },
    { id: 'prod_leche', qty: 1, kilosRequested: 1 }, { id: 'prod_carne', qty: 1, kilosRequested: 1.2345 }])('valida peso/cantidad servidor %j', async item => {
    await expect(create({ ...validPickupRequest(), items: [item] })).rejects.toBeInstanceOf(ValidationError)
  })
  it('calcula gratuidad con subtotal servidor, retiro sin envío y domicilio con solo GPS', async () => {
    expect((await create({ ...validDeliveryRequest(), items: [variableWeightItem()] })).shippingCost).toBe(0)
    expect((await create({ ...validPickupRequest(), shippingCost: 9999 })).shippingCost).toBe(0)
    const order = await create({ ...validDeliveryRequest(), deliveryData: { lat: 3.5, lng: -74.8 } })
    expect(order.deliveryData).toEqual({ lat: 3.5, lng: -74.8 })
  })
  it('repite el original aun con catálogo agotado, tienda cerrada y estado posteriormente cambiado', async () => {
    const key = randomUUID(), original = await create(validPickupRequest(), key)
    await alter('prod_leche', { inStock: false, name: 'Nombre posterior', price: 9900 })
    await updateStoreSettings(deps(), { id: 'owner', role: 'owner', storeId: context.storeId }, { scheduleOverride: 'closed' })
    await orders.updateStatus(original.id, 'confirmed', clock.nowIso())
    const retry = await create({ ...validPickupRequest(), shippingCost: 1, items: [{ id: 'prod_leche', qty: 2, priceAtMoment: 1 }] }, key)
    expect(retry).toEqual(original)
    expect(await orders.listByStore(context.storeId)).toHaveLength(1)
  })
  it('misma clave con intención distinta 409; cuenta distinta no colisiona', async () => {
    const key = randomUUID(); await create(validPickupRequest(), key)
    await expect(create({ ...validPickupRequest(), customerName: 'Otro' }, key)).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
    const other = { ...customer, id: 'otra-cuenta' }
    expect((await create({ ...validPickupRequest(), userId: other.id }, key, other)).customerId).toBe(other.id)
  })
  it('recupera un commit concurrente si la lectura inicial no lo vio y el catálogo ya cambió', async () => {
    const key = randomUUID(), original = await create(validPickupRequest(), key)
    await alter('prod_leche', { inStock: false })
    vi.spyOn(orders, 'findCreation').mockResolvedValueOnce(null)
    expect(await create(validPickupRequest(), key)).toEqual(original)
    expect(await orders.listByStore(context.storeId)).toHaveLength(1)
  })
  it('si falla la lectura de recuperación se conserva el error original del commit', async () => {
    vi.spyOn(orders, 'createIdempotently').mockRejectedValueOnce(new Error('commit perdido'))
    vi.spyOn(orders, 'findCreation').mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('reread caído'))
    await expect(create()).rejects.toThrow('commit perdido')
    expect(await orders.listByStore(context.storeId)).toHaveLength(0)
  })
  it('la recuperación que encuentra otra intención con la misma clave responde conflicto, no el error del commit', async () => {
    const key = randomUUID(); await create(validPickupRequest(), key)
    const other = { ...validPickupRequest(), customerName: 'Otra intención' }
    vi.spyOn(orders, 'findCreation').mockResolvedValueOnce(null)
    vi.spyOn(orders, 'createIdempotently').mockRejectedValueOnce(new Error('respuesta perdida'))
    await expect(create(other, key)).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
    expect(await orders.listByStore(context.storeId)).toHaveLength(1)
  })
  it('misma clave con dos intenciones distintas en concurrencia: un pedido, un cupo y 409 para la otra', async () => {
    const key = randomUUID(), a = validPickupRequest(), b = { ...validPickupRequest(), customerName: 'Otra intención' }
    const settled = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => create(i % 2 ? a : b, key)))
    const created = settled.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
    const rejected = settled.flatMap(r => (r.status === 'rejected' ? [r.reason as { code: string }] : []))
    expect(created.length).toBeGreaterThan(0); expect(rejected.length).toBeGreaterThan(0)
    expect(new Set(created.map(o => o.id)).size).toBe(1)
    expect(rejected.every(error => error.code === 'IDEMPOTENCY_KEY_REUSED')).toBe(true)
    expect(await orders.listByStore(context.storeId)).toHaveLength(1)
  })
  it('la huella ordena los IDs por unidades de código, no por locale', async () => {
    const base = await catalog.findProduct(context.storeId, 'prod_leche')
    if (!base) throw Error('Missing fixture')
    for (const id of ['prod_Zz', 'prod_aa']) await catalog.createProduct({ ...base, id, version: 1 })
    const body = { ...validPickupRequest(), items: [{ id: 'prod_aa', qty: 1 }, { id: 'prod_Zz', qty: 1 }] }
    const commit = vi.spyOn(orders, 'createIdempotently')
    await create(body)
    const data = createOrderRequestSchema.parse(body)
    const expected = createHash('sha256').update(JSON.stringify({
      items: [{ id: 'prod_Zz', qty: 1 }, { id: 'prod_aa', qty: 1 }],
      substitutionPreference: data.substitutionPreference, deliveryType: data.deliveryType,
      deliveryData: { address: data.deliveryData.address, lat: data.deliveryData.lat,
        lng: data.deliveryData.lng, timeSlot: data.deliveryData.timeSlot },
      customerName: data.customerName, customerPhone: data.customerPhone,
    })).digest('hex')
    expect(commit.mock.calls[0]?.[0].fingerprint).toBe(expected)
  })
  it('concurrencia devuelve un ID y un cupo; nuevos pedidos respetan veinte por hora', async () => {
    const key = randomUUID()
    const created = await Promise.all(Array.from({ length: 12 }, () => create(validPickupRequest(), key)))
    expect(new Set(created.map(o => o.id)).size).toBe(1)
    for (let i = 1; i < 20; i++) await create()
    await expect(create()).rejects.toBeInstanceOf(RateLimitedError)
    expect((await create(validPickupRequest(), key)).id).toBe(created[0]?.id)
    clock.advanceSeconds(3600)
    expect((await create()).status).toBe('received')
  })
  it('rechaza tienda cerrada sin consumir quota y aplica corte/franja', async () => {
    const owner = { id: 'owner', role: 'owner' as const, storeId: context.storeId }
    await updateStoreSettings(deps(), owner, { scheduleOverride: 'closed' })
    await expect(create()).rejects.toMatchObject({ code: 'STORE_CLOSED' })
    await updateStoreSettings(deps(), owner, { scheduleOverride: 'open', delivery: { cutoff: '10:00' } })
    await expect(create(validDeliveryRequest())).rejects.toMatchObject({ code: 'DELIVERY_CUTOFF_PASSED' })
    expect((await create()).shippingCost).toBe(0)
  })
  it.each([undefined, 'short', 'bad key with spaces', 'x'.repeat(129)])('rechaza clave inválida %j', async key => {
    await expect(createOrder(deps(), customer, validPickupRequest(), context, key)).rejects.toBeInstanceOf(ValidationError)
  })
  it('no acepta identidad, contexto, resultados o peso real adulterados', async () => {
    await expect(create({ ...validPickupRequest(), userId: 'otra' })).rejects.toBeInstanceOf(AuthorizationError)
    for (const extra of [{ storeId: 'otra' }, { estimatedTotal: 1 }, { status: 'delivered' }, { customerPhone: '123' }]) {
      await expect(create({ ...validPickupRequest(), ...extra })).rejects.toBeInstanceOf(ValidationError)
    }
    await expect(create({ ...validPickupRequest(), items: [{ ...variableWeightItem(), kilosReal: 1 }] })).rejects.toBeInstanceOf(ValidationError)
  })
  it('rechaza total COP sobre máximo desde precios reales', async () => {
    await alter('prod_leche', { price: 60_000_000 })
    await expect(create()).rejects.toBeInstanceOf(ValidationError)
  })
})
