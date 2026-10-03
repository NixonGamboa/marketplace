import { describe, expect, it } from 'vitest'
import { createOrderRequestSchema } from '../../../../shared/contracts/index.js'
import { HmacBucketKeyer } from '../../../src/infra/auth/randomIds.js'
import { CatalogRepositoryMemory } from '../../../src/infra/memory/CatalogRepositoryMemory.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import { StoreRepositoryMemory } from '../../../src/infra/memory/StoreRepositoryMemory.js'
import { createOrder, idempotencyKeyHash, orderIntentFingerprint } from '../../../src/usecases/orders/createOrder.js'
import { TEST_SECRET, TestClock } from '../../auth/fixtures.js'
import { validPickupRequest } from '../../contratos/fixtures.js'
import { initializeOrderCatalog } from '../../orders/creationFixture.js'

const customer = { id: 'cust_01', role: 'customer' as const, storeId: null }

describe('ID de pedido inyectable y huella exportada (seed T-16)', () => {
  const setup = async () => {
    const orders = new OrdersRepositoryMemory()
    const store = new StoreRepositoryMemory()
    const catalog = new CatalogRepositoryMemory(id => store.hasStore(id))
    const clock = new TestClock(new Date('2026-10-05T15:00:00.000Z'))
    const keys = new HmacBucketKeyer(TEST_SECRET)
    await initializeOrderCatalog({ catalog, store, clock })
    return { orders, catalog, store, clock, keys }
  }

  it('usa el generador recibido y el replay con la misma clave devuelve ese mismo pedido', async () => {
    const deps = await setup()
    const outcomes: string[] = []
    const onCreationOutcome = (kind: 'created' | 'replayed') => outcomes.push(kind)
    const first = await createOrder({ ...deps, onCreationOutcome, newOrderId: () => 'ord-fijo-0001' }, customer, validPickupRequest(), { storeId: 'leche-y-miel' }, 'clave-estable-0001')
    expect(first.id).toBe('ord-fijo-0001')
    const again = await createOrder({ ...deps, onCreationOutcome, newOrderId: () => 'ord-fijo-9999' }, customer, validPickupRequest(), { storeId: 'leche-y-miel' }, 'clave-estable-0001')
    expect(again.id).toBe('ord-fijo-0001')
    expect(await deps.orders.listByStore('leche-y-miel')).toHaveLength(1)
    expect(outcomes).toEqual(['created', 'replayed'])
  })

  it('un observador que falla no altera la creación ni el replay ni dispara la recuperación', async () => {
    const deps = await setup()
    let calls = 0
    const onCreationOutcome = () => { calls++; throw new Error('observador caído') }
    const first = await createOrder({ ...deps, onCreationOutcome }, customer, validPickupRequest(), { storeId: 'leche-y-miel' }, 'clave-estable-0005')
    const again = await createOrder({ ...deps, onCreationOutcome }, customer, validPickupRequest(), { storeId: 'leche-y-miel' }, 'clave-estable-0005')
    expect(again.id).toBe(first.id)
    expect(await deps.orders.listByStore('leche-y-miel')).toHaveLength(1)
    expect(calls).toBe(2)
  })

  it('sin generador sigue creando IDs ULID aleatorios', async () => {
    const deps = await setup()
    const one = await createOrder(deps, customer, validPickupRequest(), { storeId: 'leche-y-miel' }, 'clave-estable-0002')
    const two = await createOrder(deps, customer, validPickupRequest(), { storeId: 'leche-y-miel' }, 'clave-estable-0003')
    expect(one.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(two.id).not.toBe(one.id)
  })

  it('la huella exportada es la que guarda el claim y ignora los campos legacy', async () => {
    const deps = await setup()
    const request = validPickupRequest()
    await createOrder(deps, customer, request, { storeId: 'leche-y-miel' }, 'clave-estable-0004')
    const claim = await deps.orders.findCreation({ customerId: customer.id, storeId: 'leche-y-miel', keyHash: idempotencyKeyHash('clave-estable-0004') })
    const parsed = createOrderRequestSchema.parse(request)
    expect(claim?.fingerprint).toBe(orderIntentFingerprint(parsed))
    expect(orderIntentFingerprint(createOrderRequestSchema.parse({ ...request, shippingCost: 1234 }))).toBe(orderIntentFingerprint(parsed))
  })
})
