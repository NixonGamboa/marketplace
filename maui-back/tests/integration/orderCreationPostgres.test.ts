import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORDER_CREATE_POLICY } from '../../src/domain/orders/orderAccess.js'
import { OrderPersistenceError } from '../../src/domain/orders/orderCreation.js'
import type { Db } from '../../src/infra/postgres/client.js'
import { HmacBucketKeyer } from '../../src/infra/auth/randomIds.js'
import { OrdersRepositoryPostgres } from '../../src/infra/postgres/OrdersRepositoryPostgres.js'
import { CatalogRepositoryPostgres } from '../../src/infra/postgres/CatalogRepositoryPostgres.js'
import { StoreRepositoryPostgres } from '../../src/infra/postgres/StoreRepositoryPostgres.js'
import { createOrder } from '../../src/usecases/orders/createOrder.js'
import { TestClock, TEST_SECRET } from '../auth/fixtures.js'
import { validPickupRequest, validDeliveryRequest } from '../contratos/fixtures.js'
import { initializeOrderCatalog } from '../orders/creationFixture.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'
import { forceStatus } from '../orders/forceStatus.js'
import { toOrderDto } from '../../src/domain/orders/orderMappers.js'

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
  /** Llamada directa a la función SQL, sin pasar por el caso de uso. */
  const commitDirect = async (patch: { customer?: string; store?: string; key?: string; order?: Record<string, unknown>;
    limit?: number; window?: number; bucket?: string } = {}) => {
    const at = '2026-10-05T15:00:00.000Z', customer = patch.customer ?? 'cust_01', store = patch.store ?? 'leche-y-miel'
    const order = { id: `direct-${randomUUID()}`, storeId: store, customerId: customer, customerName: 'Directo',
      customerPhone: '573001234567', items: [{ id: 'prod_leche', qty: 1, priceAtMoment: 4500 }], status: 'received',
      deliveryType: 'pickup', deliveryData: {}, substitutionPreference: 'call_me', shippingCost: 0,
      estimatedTotal: 4500, createdAt: at, updatedAt: at, ...patch.order }
    const versionOf = async (query: string) => (await embedded.pg.query<{ version: number }>(query)).rows[0]?.version
    const result = await embedded.pg.query<{ result: { kind: string; retryAfterSeconds?: number } }>(
      'select maui_commit_order($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10) as result',
      [customer, store, patch.key ?? randomUUID(), 'huella', JSON.stringify(order),
        await versionOf("select version from stores where id='leche-y-miel'"),
        JSON.stringify([{ id: 'prod_leche', version: await versionOf("select version from catalog_products where id='prod_leche'") }]),
        patch.bucket ?? 'direct:bucket', patch.limit ?? ORDER_CREATE_POLICY.limit, patch.window ?? ORDER_CREATE_POLICY.windowSeconds])
    return result.rows[0]?.result
  }
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
  it('PM-03: pedido recibido con la tienda cerrada persiste y conserva su aviso en cada lectura, sin migración', async () => {
    await embedded.pg.exec("UPDATE stores SET schedule_override='closed',version=version+1")
    const key = randomUUID(), created = await create(key)
    const notice = { kind: 'unscheduled', reason: 'override_closed' }
    expect(created).toMatchObject({ status: 'received', processingNotice: notice })
    expect(await counts()).toEqual({ orders: 1, claims: 1, attempts: 1 })
    // El aviso vive en el snapshot de creación; la tabla de pedidos no cambió de forma.
    const stored = await embedded.pg.query<{ notice: unknown }>("select snapshot->'processingNotice' as notice from order_creations")
    expect(stored.rows[0]?.notice).toEqual(notice)
    expect((await embedded.pg.query<{ column_name: string }>("select column_name from information_schema.columns where table_name='orders'"))
      .rows.map(row => row.column_name)).not.toContain('processing_notice')
    expect((await orders.findById(created.id))?.processingNotice).toEqual(notice)
    expect(toOrderDto((await orders.findById(created.id))!)).toMatchObject({ processingNotice: notice })
    const page = await orders.listPage({ scope: { kind: 'customer', customerId: actor.id }, filter: {}, limit: 10 })
    expect(page.entries.map(entry => entry.order.processingNotice)).toEqual([notice])
    // Un cambio de estado posterior conserva el aviso del snapshot original.
    expect((await forceStatus(orders, created.id, 'confirmed', clock.nowIso())).processingNotice).toEqual(notice)
    await embedded.pg.exec("UPDATE stores SET schedule_override='open',version=version+1")
    expect(await create(key)).toEqual(created)
    expect(await counts()).toEqual({ orders: 1, claims: 1, attempts: 1 })
  })
  it('PM-03: tras escribir un cambio no se relee el aviso: un fallo de lectura no oculta un cambio ya persistido', async () => {
    await embedded.pg.exec("UPDATE stores SET schedule_override='closed',version=version+1")
    const created = await create()
    const current = (await orders.findById(created.id))!
    // Cualquier SELECT posterior al UPDATE fallaría; el cambio debe confirmarse y devolverse igualmente.
    const noReads = new OrdersRepositoryPostgres(new Proxy(embedded.db, {
      get: (target, property, receiver) => {
        if (property === 'select') throw new Error('lectura posterior a la escritura')
        return Reflect.get(target, property, receiver)
      },
    }))
    const saved = await noReads.saveChange({
      expected: { id: current.id, storeId: current.storeId, version: current.version, status: current.status },
      next: { ...current, status: 'confirmed', version: current.version + 1, updatedAt: clock.nowIso() }, products: [],
    })
    expect(saved).toMatchObject({ status: 'confirmed', version: 2, processingNotice: created.processingNotice })
    expect((await orders.findById(created.id))).toMatchObject({ status: 'confirmed', processingNotice: created.processingNotice })
  })
  it('PM-03: la fecha de la franja se persiste en el snapshot, se lee en cada vía y no se relee tras escribir', async () => {
    // Esta prueba cambia horario y franjas de la tienda compartida: se restauran al terminar.
    const original = (await embedded.pg.query<{ weekly_schedule: unknown; time_slots: unknown }>('select weekly_schedule, time_slots from stores')).rows[0]!
    try {
    const full = "'{\"open\":\"08:00\",\"close\":\"18:00\",\"closed\":false}'"
    const late = "'{\"open\":\"14:00\",\"close\":\"18:00\",\"closed\":false}'"
    const off = "'{\"open\":\"08:00\",\"close\":\"18:00\",\"closed\":true}'"
    await embedded.pg.exec(`UPDATE stores SET schedule_override='auto', version=version+1,
      weekly_schedule=jsonb_build_object('mon',${full}::jsonb,'tue',${late}::jsonb,'wed',${full}::jsonb,'thu',${off}::jsonb,'fri',${off}::jsonb,'sat',${off}::jsonb,'sun',${off}::jsonb),
      time_slots='[{"id":"morning","enabled":true,"start":"08:00","end":"12:00"},{"id":"afternoon","enabled":false,"start":"12:00","end":"17:00"},{"id":"asap","enabled":false}]'::jsonb`)
    clock = new TestClock(new Date('2026-10-05T19:00:00.000Z')) // lunes 14:00 en Bogotá: abierta y la franja de hoy ya venció
    const key = randomUUID(), created = await create(key, { ...validPickupRequest(), deliveryData: { timeSlot: 'morning' } })
    expect(created).toMatchObject({ timeSlotDate: '2026-10-07' })
    expect(created.processingNotice).toBeUndefined()
    const stored = await embedded.pg.query<{ slot_date: string; notice: unknown }>("select snapshot->>'timeSlotDate' as slot_date, snapshot->'processingNotice' as notice from order_creations")
    expect(stored.rows[0]).toEqual({ slot_date: '2026-10-07', notice: null })
    const read = (await orders.findById(created.id))!
    expect(read.timeSlotDate).toBe('2026-10-07')
    expect(toOrderDto(read)).toMatchObject({ timeSlotDate: '2026-10-07', deliveryData: { timeSlot: 'morning' } })
    const page = await orders.listPage({ scope: { kind: 'customer', customerId: actor.id }, filter: {}, limit: 10 })
    expect(page.entries.map(entry => entry.order.timeSlotDate)).toEqual(['2026-10-07'])
    // Cambiar el horario después no altera la fecha guardada; un cambio de estado sin lecturas posteriores la conserva.
    await embedded.pg.exec("UPDATE stores SET weekly_schedule=weekly_schedule || '{\"wed\":{\"open\":\"08:00\",\"close\":\"18:00\",\"closed\":true}}'::jsonb, version=version+1")
    const noReads = new OrdersRepositoryPostgres(new Proxy(embedded.db, {
      get: (target, property, receiver) => {
        if (property === 'select') throw new Error('lectura posterior a la escritura')
        return Reflect.get(target, property, receiver)
      },
    }))
    const saved = await noReads.saveChange({
      expected: { id: read.id, storeId: read.storeId, version: read.version, status: read.status },
      next: { ...read, status: 'confirmed', version: read.version + 1, updatedAt: clock.nowIso() }, products: [],
    })
    expect(saved).toMatchObject({ status: 'confirmed', timeSlotDate: '2026-10-07' })
    expect(await create(key, { ...validPickupRequest(), deliveryData: { timeSlot: 'morning' } })).toEqual(created)
    expect((await orders.findById(created.id))?.timeSlotDate).toBe('2026-10-07')
    // Un pedido anterior (sin fecha en su snapshot) sigue leyéndose sin fecha.
    await embedded.pg.exec("UPDATE order_creations SET snapshot = snapshot - 'timeSlotDate'")
    expect((await orders.findById(created.id))?.timeSlotDate).toBeUndefined()
    } finally {
      await embedded.pg.query('update stores set weekly_schedule=$1::jsonb, time_slots=$2::jsonb, version=version+1', [JSON.stringify(original.weekly_schedule), JSON.stringify(original.time_slots)])
    }
  })
  it('PM-03: horario programado fija la próxima apertura en UTC; abierta o sin snapshot no lleva aviso', async () => {
    await embedded.pg.exec("UPDATE stores SET schedule_override='auto',version=version+1")
    clock = new TestClock(new Date('2026-10-06T01:00:00.000Z')) // lunes 20:00 en Bogotá: tras el cierre
    const closed = await create()
    expect(closed.processingNotice).toEqual({ kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-06T13:00:00.000Z' })
    expect((await orders.findById(closed.id))?.processingNotice).toEqual(closed.processingNotice)
    clock = new TestClock(new Date('2026-10-05T15:00:00.000Z'))
    const open = await create()
    expect(open.processingNotice).toBeUndefined()
    expect((await orders.findById(open.id))?.processingNotice).toBeUndefined()
    // Pedidos sin fila de creación (seed/legacy) se leen sin aviso.
    const direct = await orders.create({ ...open, id: `direct-${randomUUID()}` })
    expect((await orders.findById(direct.id))?.processingNotice).toBeUndefined()
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
    await forceStatus(orders, original.id, 'confirmed', clock.nowIso())
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
  it('misma clave con dos intenciones distintas en concurrencia: un pedido, un claim, un cupo y 409 para la otra', async () => {
    const key = randomUUID(), other = new OrdersRepositoryPostgres(embedded.db)
    const a = validPickupRequest(), b = { ...validPickupRequest(), customerName: 'Otra intención' }
    const settled = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
      createOrder({ ...deps(), orders: i % 2 ? orders : other }, actor, i % 3 ? a : b, context, key)))
    const created = settled.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
    const rejected = settled.flatMap(r => (r.status === 'rejected' ? [r.reason as { code: string }] : []))
    expect(created.length).toBeGreaterThan(0); expect(rejected.length).toBeGreaterThan(0)
    expect(new Set(created.map(o => o.id)).size).toBe(1)
    expect(rejected.every(error => error.code === 'IDEMPOTENCY_KEY_REUSED')).toBe(true)
    expect(await counts()).toEqual({ orders: 1, claims: 1, attempts: 1 })
  })
  it('la función SQL rechaza contexto inconsistente sin dejar claim, pedido ni cuota', async () => {
    await expect(commitDirect({ order: { customerId: 'cust_ajena' } })).rejects.toThrow('Invalid creation context')
    await expect(commitDirect({ order: { storeId: 'otra-tienda' } })).rejects.toThrow('Invalid creation context')
    await expect(commitDirect({ limit: ORDER_CREATE_POLICY.limit + 1 })).rejects.toThrow('Invalid creation context')
    await expect(commitDirect({ window: ORDER_CREATE_POLICY.windowSeconds + 1 })).rejects.toThrow('Invalid creation context')
    expect(await counts()).toEqual({ orders: 0, claims: 0, attempts: 0 })
  })
  it('la función SQL aplica directamente el cupo de veinte: el 21 es limited sin pedido ni claim', async () => {
    for (let i = 0; i < ORDER_CREATE_POLICY.limit; i++) expect((await commitDirect())?.kind).toBe('created')
    expect(await commitDirect()).toEqual({ kind: 'limited', retryAfterSeconds: ORDER_CREATE_POLICY.windowSeconds })
    expect(await counts()).toEqual({ orders: 20, claims: 20, attempts: 21 })
  })
  it('la política TypeScript coincide con el límite y la ventana fijados en la migración 0004', () => {
    const sqlText = readFileSync(new URL('../../src/infra/postgres/migrations/0004_order_creation_idempotency.sql', import.meta.url), 'utf8')
    expect(sqlText).toContain(`p_limit<>${ORDER_CREATE_POLICY.limit} OR p_window<>${ORDER_CREATE_POLICY.windowSeconds}`)
  })
  it('errores del driver o snapshot corrupto se reducen a OrderPersistenceError sin SQL ni datos', async () => {
    const leak = 'postgres://user:secret@host/db INSERT customer_phone 573001234567'
    const failing = new OrdersRepositoryPostgres({
      execute: async () => { throw new Error(leak) },
      select: () => { throw new Error(leak) },
    } as unknown as Db)
    const identity = { customerId: 'cust_01', storeId: 'leche-y-miel', keyHash: 'k' }
    for (const failure of [failing.findCreation(identity),
      createOrder({ ...deps(), orders: failing }, actor, validPickupRequest(), context, randomUUID())]) {
      const error = await failure.then(() => undefined, (reason: unknown) => reason)
      expect(error).toBeInstanceOf(OrderPersistenceError)
      expect(JSON.stringify([(error as Error).message, (error as Error).stack])).not.toMatch(/secret|INSERT|573001234567/)
    }
    await create(randomUUID())
    await embedded.pg.exec("UPDATE order_creations SET snapshot='{}'::jsonb")
    const keyHash = (await embedded.pg.query<{ key_hash: string }>('select key_hash from order_creations')).rows[0]?.key_hash ?? ''
    await expect(orders.findCreation({ ...identity, keyHash })).rejects.toBeInstanceOf(OrderPersistenceError)
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
