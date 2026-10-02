import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HmacBucketKeyer } from '../../src/infra/auth/randomIds.js'
import { OrdersRepositoryPostgres } from '../../src/infra/postgres/OrdersRepositoryPostgres.js'
import { CatalogRepositoryPostgres } from '../../src/infra/postgres/CatalogRepositoryPostgres.js'
import { StoreRepositoryPostgres } from '../../src/infra/postgres/StoreRepositoryPostgres.js'
import { createOrder } from '../../src/usecases/orders/createOrder.js'
import { TestClock, TEST_SECRET } from '../auth/fixtures.js'
import { validPickupRequest, validDeliveryRequest } from '../contratos/fixtures.js'
import { initializeOrderCatalog } from '../orders/creationFixture.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

const actor = { id: 'cust_01', role: 'customer' as const, storeId: null }
const context = { storeId: 'leche-y-miel' }
describe('T-10: commit real PostgreSQL de pedido, idempotencia y cuota', () => {
  let embedded: EmbeddedPostgres, orders: OrdersRepositoryPostgres,
    catalog: CatalogRepositoryPostgres, store: StoreRepositoryPostgres
  let clock = new TestClock(new Date('2026-10-05T15:00:00.000Z'))
  const keys = new HmacBucketKeyer(TEST_SECRET)
  const deps = () => ({ orders, catalog, store, clock, keys })
  const create = (key = randomUUID(), body: unknown = validPickupRequest()) => createOrder(deps(), actor, body, context, key)
  const counts = async () => (await embedded.pg.query<{ orders: number; claims: number; attempts: number }>(
    'select (select count(*)::int from orders) as orders, (select count(*)::int from order_creations) as claims, coalesce((select sum(attempts)::int from auth_rate_limits),0) as attempts',
  )).rows[0]
  beforeAll(async () => {
    embedded = await startEmbeddedPostgres(); orders = new OrdersRepositoryPostgres(embedded.db)
    catalog = new CatalogRepositoryPostgres(embedded.db); store = new StoreRepositoryPostgres(embedded.db)
    await initializeOrderCatalog(deps())
  }, 30_000)
  beforeEach(async () => {
    vi.restoreAllMocks(); clock = new TestClock(new Date('2026-10-05T15:00:00.000Z'))
    await embedded.pg.exec("DELETE FROM orders; DELETE FROM auth_rate_limits; UPDATE stores SET schedule_override='open',version=version+1; UPDATE catalog_products SET in_stock=true,active=true,archived_at=null,version=version+1;")
  })
  afterAll(async () => { vi.restoreAllMocks(); if (embedded) await embedded.close() })
  it('persistencia de importes/snapshots autoritativos y guard de versions', async () => {
    const order = await create(randomUUID(), { ...validDeliveryRequest(), shippingCost: 1,
      items: [{ id: 'prod_leche', qty: 2, priceAtMoment: 1, name: 'Fraude', is_variable_weight: true }] })
    expect(order).toMatchObject({ estimatedTotal: 12000, shippingCost: 3000 })
    expect((await orders.findById(order.id))?.items[0]).toMatchObject({ priceAtMoment: 4500, unit: '1 L', name: 'Leche entera 1L' })
    expect(await counts()).toEqual({ orders: 1, claims: 1, attempts: 1 })
  })
  it('dos adapters concurrentes confirman un ID y un único cupo (PGlite serializa conexiones)', async () => {
    const second = new OrdersRepositoryPostgres(embedded.db), key = randomUUID()
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      createOrder({ ...deps(), orders: i % 2 ? orders : second }, actor, validPickupRequest(), context, key)))
    expect(new Set(results.map(o => o.id)).size).toBe(1)
    expect(await counts()).toEqual({ orders: 1, claims: 1, attempts: 1 })
  })
  it('retry original después de cierre/agotado/estado cambiado, conflicto no consume quota', async () => {
    const key = randomUUID(), original = await create(key)
    await embedded.pg.exec("UPDATE stores SET schedule_override='closed',version=version+1; UPDATE catalog_products SET in_stock=false,version=version+1;")
    await orders.updateStatus(original.id, 'confirmed', clock.nowIso())
    expect(await create(key)).toEqual(original)
    await expect(create(key, { ...validPickupRequest(), customerName: 'Otro' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
    expect(await counts()).toEqual({ orders: 1, claims: 1, attempts: 1 })
  })
  it('misma clave aislada por cuenta y huella canónica independiente del orden de items/legacy', async () => {
    const key = randomUUID(), body = { ...validPickupRequest(), items: [{ id: 'prod_leche', qty: 2 }, { id: 'prod_carne', qty: 1, kilosRequested: 1 }] }
    const original = await create(key, body)
    expect(await create(key, { ...body, items: [...body.items].reverse(), shippingCost: 99 })).toEqual(original)
    await createOrder(deps(), { ...actor, id: 'cust_02' }, { ...body, userId: 'cust_02' }, context, key)
    expect(await counts()).toEqual({ orders: 2, claims: 2, attempts: 2 })
  })
  it.each(['catalog', 'store'])('cambio de %s entre lectura y commit: 409 sin cuota/claim/pedido', async which => {
    const commit = orders.createIdempotently.bind(orders)
    vi.spyOn(orders, 'createIdempotently').mockImplementation(async input => {
      await embedded.pg.exec(which === 'catalog' ? "UPDATE catalog_products SET version=version+1 WHERE id='prod_leche'" : "UPDATE stores SET version=version+1")
      return commit(input)
    })
    await expect(create()).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await counts()).toEqual({ orders: 0, claims: 0, attempts: 0 })
  })
  it('fallo después de reservar cuota hace rollback: la misma clave puede volver a crear', async () => {
    await embedded.pg.exec("CREATE FUNCTION public.reject_order_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER reject_order_fixture BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION public.reject_order_fixture();")
    const key = randomUUID()
    await expect(create(key)).rejects.toBeDefined()
    expect(await counts()).toEqual({ orders: 0, claims: 0, attempts: 0 })
    await embedded.pg.exec('DROP TRIGGER reject_order_fixture ON orders; DROP FUNCTION public.reject_order_fixture();')
    expect((await create(key)).status).toBe('received')
    expect(await counts()).toEqual({ orders: 1, claims: 1, attempts: 1 })
  })
  it('veinte pedidos por hora; retries válidos después de 429 no consumen más', async () => {
    const key = randomUUID(); const first = await create(key)
    for (let i = 1; i < 20; i++) await create()
    await expect(create()).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 3600 })
    expect((await create(key)).id).toBe(first.id)
    expect(await counts()).toEqual({ orders: 20, claims: 20, attempts: 21 })
    clock.advanceSeconds(3600)
    expect((await create()).status).toBe('received')
  })
})
