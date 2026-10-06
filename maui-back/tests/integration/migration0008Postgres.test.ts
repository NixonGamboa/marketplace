import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ORDER_CREATE_POLICY } from '../../src/domain/orders/orderAccess.js'
import { HmacBucketKeyer } from '../../src/infra/auth/randomIds.js'
import { CatalogRepositoryPostgres } from '../../src/infra/postgres/CatalogRepositoryPostgres.js'
import { OrdersRepositoryPostgres } from '../../src/infra/postgres/OrdersRepositoryPostgres.js'
import { StoreRepositoryPostgres } from '../../src/infra/postgres/StoreRepositoryPostgres.js'
import { createOrder, idempotencyKeyHash } from '../../src/usecases/orders/createOrder.js'
import { TEST_SECRET, TestClock } from '../auth/fixtures.js'
import { internalOrder, validPickupRequest } from '../contratos/fixtures.js'
import * as v1 from '../contratos/legacy/ordersV1.js'
import { initializeOrderCatalog } from '../orders/creationFixture.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

const MIGRATION = '0008_orders_payment_reference'
const MIGRATION_SQL = readFileSync(new URL(`../../src/infra/postgres/migrations/${MIGRATION}.sql`, import.meta.url), 'utf8')
const STORE = 'leche-y-miel'
const OTHER = 'otra-tienda'
const TIE = '2026-09-02 10:00:00+00'

/** Filas tal como estaban antes de 0008 (columnas hasta 0007), en dos tiendas, con un empate de fecha. */
const LEGACY: [id: string, store: string, createdAt: string][] = [
  ['ord_b', STORE, TIE],
  ['ord_a', STORE, TIE],
  ['ord_old', STORE, '2026-09-01 08:00:00+00'],
  ['ord_new', STORE, '2026-09-03 09:00:00+00'],
  ['ord_x', OTHER, '2026-09-02 12:00:00+00'],
]

const insertLegacy = async (pg: PGlite): Promise<void> => {
  for (const [id, store, createdAt] of LEGACY) {
    await pg.query(
      `insert into orders (id, store_id, customer_id, customer_name, customer_phone, items, total, status, delivery_mode,
         substitution_preference, created_at, updated_at, version)
       values ($1, $2, 'cust_legacy', 'Cliente', '573001112222', $3::jsonb, 9000, 'delivered', 'pickup', 'call_me', $4, $4, 4)`,
      [id, store, JSON.stringify([{ id: 'prod_leche', name: 'Leche', qty: 2, priceAtMoment: 4500 }]), createdAt],
    )
  }
}

/** Sobre de la función tal como lo lee la API 1.0.1 (`commitCreation`): objeto no estricto. */
const v1Envelope = z.object({ kind: z.string(), creation: z.object({ fingerprint: z.string(), order: z.unknown() }).optional() })

/** `decodeCreationOrder` de 1.0.1: valida el snapshot con su DTO estricto. */
const decodeAsV1 = (snapshot: unknown) => {
  const { id, storeId: _store, customerId, ...fields } = z.object({ id: z.string(), storeId: z.string(), customerId: z.string() }).passthrough().parse(snapshot)
  return v1.orderDtoSchema.parse({ ...fields, orderId: id, userId: customerId })
}

describe('migración 0008: método de pago y referencia comercial', () => {
  let embedded: EmbeddedPostgres
  let orders: OrdersRepositoryPostgres
  const clock = new TestClock(new Date('2026-10-05T15:00:00.000Z'))
  const keys = new HmacBucketKeyer(TEST_SECRET)
  const query = async <T extends object>(text: string, params: unknown[] = []): Promise<T[]> => (await embedded.pg.query<T>(text, params)).rows
  const references = async (): Promise<Record<string, number>> =>
    Object.fromEntries((await query<{ id: string; reference_number: number }>('select id, reference_number from orders order by id')).map(row => [row.id, row.reference_number]))
  const counters = async () => query<{ store_id: string; last_value: number }>('select store_id, last_value from order_reference_counters order by store_id')

  beforeAll(async () => {
    embedded = await startEmbeddedPostgres({ beforeMigration: { [MIGRATION]: insertLegacy } })
    orders = new OrdersRepositoryPostgres(embedded.db)
    const catalog = new CatalogRepositoryPostgres(embedded.db), store = new StoreRepositoryPostgres(embedded.db)
    await initializeOrderCatalog({ catalog, store, clock })
  })
  afterAll(async () => { await embedded?.close() })

  it('numera los pedidos anteriores una vez, por tienda y orden de creación, en efectivo y sin tocar versión ni fechas', async () => {
    expect(await references()).toEqual({ ord_old: 1, ord_a: 2, ord_b: 3, ord_new: 4, ord_x: 1 })
    expect(await counters()).toEqual([{ store_id: STORE, last_value: 4 }, { store_id: OTHER, last_value: 1 }])
    const rows = await query<{ payment_method: string; version: number; same: boolean }>(
      `select payment_method, version, updated_at = created_at as same from orders`)
    expect(rows.every(row => row.payment_method === 'cash' && row.version === 4 && row.same)).toBe(true)
    expect(await orders.findById('ord_a')).toMatchObject({ reference: 2, paymentMethod: 'cash', version: 4 })
  })

  it('repetir la migración (interrumpida y reintentada) no renumera ni falla', async () => {
    const before = await references()
    await embedded.pg.exec(MIGRATION_SQL)
    expect(await references()).toEqual(before)
    expect(await counters()).toEqual([{ store_id: STORE, last_value: 4 }, { store_id: OTHER, last_value: 1 }])
    const triggers = await query<{ n: number }>(`select count(*)::int as n from pg_trigger where tgname = 'orders_assign_reference'`)
    expect(triggers[0]?.n).toBe(1)
  })

  it('el pedido nuevo sigue al mayor; la referencia es inmutable, única por tienda y no se reutiliza', async () => {
    const created = await orders.create(internalOrder({ id: 'ord_nuevo', reference: 1 }))
    expect(created.reference).toBe(5)
    await expect(embedded.pg.query(`update orders set reference_number = 99 where id = 'ord_nuevo'`)).rejects.toMatchObject({ code: '23514' })
    await expect(embedded.pg.query(`update orders set store_id = '${OTHER}' where id = 'ord_nuevo'`)).rejects.toMatchObject({ code: '23514' })
    await expect(embedded.pg.query(`insert into orders select (jsonb_populate_record(null::orders, to_jsonb(o) || '{"id":"ord_dup"}'::jsonb)).* from orders o where id = 'ord_nuevo'`))
      .rejects.toMatchObject({ code: '23505' })
    await embedded.pg.query(`delete from orders where id = 'ord_nuevo'`)
    expect((await orders.create(internalOrder({ id: 'ord_tras_borrar' }))).reference).toBe(6)
    // Una referencia explícita (restauración) solo adelanta el contador.
    await embedded.pg.query(`insert into orders select (jsonb_populate_record(null::orders, to_jsonb(o) || '{"id":"ord_restaurado","reference_number":40}'::jsonb)).* from orders o where id = 'ord_a'`)
    expect((await orders.create(internalOrder({ id: 'ord_tras_restaurar' }))).reference).toBe(41)
    await expect(embedded.pg.query(`update orders set reference_number = null where id = 'ord_a'`)).rejects.toMatchObject({ code: expect.stringMatching(/^23/) })
  })

  it('la API anterior sigue creando con la función redefinida: efectivo, número asignado y snapshot legible por 1.0.1', async () => {
    const at = '2026-10-05T15:00:00.000Z', id = `old-api-${randomUUID()}`, key = randomUUID()
    const pOrder = { id, storeId: STORE, customerId: 'cust_v1', customerName: 'Cliente v1', customerPhone: '573001234567',
      items: [{ id: 'prod_leche', name: 'Leche entera 1L', unit: '1 L', qty: 1, priceAtMoment: 4500, is_variable_weight: false }],
      status: 'received', deliveryType: 'pickup', deliveryData: {}, substitutionPreference: 'call_me', shippingCost: 0,
      estimatedTotal: 4500, createdAt: at, updatedAt: at, version: 1 }
    const version = async (text: string) => (await query<{ version: number }>(text))[0]?.version
    const call = async () => (await query<{ result: unknown }>(
      'select maui_commit_order_audited($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10,$11) as result',
      ['cust_v1', STORE, key, 'huella-v1', JSON.stringify(pOrder), await version(`select version from stores where id='${STORE}'`),
        JSON.stringify([{ id: 'prod_leche', version: await version(`select version from catalog_products where id='prod_leche'`) }]),
        'bucket:v1', ORDER_CREATE_POLICY.limit, ORDER_CREATE_POLICY.windowSeconds, randomUUID()]))[0]?.result
    const created = v1Envelope.parse(await call())
    expect(created.kind).toBe('created')
    expect(decodeAsV1(created.creation?.order)).toMatchObject({ orderId: id, estimatedTotal: 4500 })
    expect(await orders.findById(id)).toMatchObject({ paymentMethod: 'cash', reference: expect.any(Number) })
    const replay = v1Envelope.parse(await call())
    expect(replay.kind).toBe('replayed')
    expect(replay.creation?.order).toEqual(created.creation?.order)
  })

  it('la API nueva guarda el método en la columna; el snapshot conserva la forma anterior y el reintento devuelve número y método', async () => {
    const key = randomUUID()
    const deps = { orders, catalog: new CatalogRepositoryPostgres(embedded.db), store: new StoreRepositoryPostgres(embedded.db), clock, keys }
    const customer = { id: 'cust_v2', role: 'customer' as const, storeId: null }
    const created = await createOrder(deps, customer, { ...validPickupRequest(), userId: 'cust_v2', paymentMethod: 'qr' }, { storeId: STORE }, key)
    expect(created).toMatchObject({ paymentMethod: 'qr', reference: expect.any(Number) })
    const [row] = await query<{ payment_method: string; snapshot: Record<string, unknown> }>(
      `select o.payment_method, c.snapshot from orders o join order_creations c on c.order_id = o.id where o.id = $1`, [created.id])
    expect(row?.payment_method).toBe('qr')
    expect(row?.snapshot).not.toHaveProperty('paymentMethod')
    expect(row?.snapshot).not.toHaveProperty('reference')
    expect(decodeAsV1(row?.snapshot)).toMatchObject({ orderId: created.id })
    const stored = await orders.findCreation({ customerId: 'cust_v2', storeId: STORE, keyHash: idempotencyKeyHash(key) })
    expect(stored?.order).toMatchObject({ id: created.id, reference: created.reference, paymentMethod: 'qr' })
    expect(await createOrder(deps, customer, { ...validPickupRequest(), userId: 'cust_v2', paymentMethod: 'qr' }, { storeId: STORE }, key)).toEqual(created)
  })
})
