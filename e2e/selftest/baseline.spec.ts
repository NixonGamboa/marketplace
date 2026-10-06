import { expect, test } from '@playwright/test'
// @ts-expect-error módulo .mjs de guards sin declaraciones
import { comparePreservedBaseline, fixtureLedgerEntry, verifiedFixtureRecords, verifyOwnOrders } from '../../scripts/e2e-baseline.mjs'

const beforeAt = '2026-10-06T00:00:00Z', afterAt = '2026-10-06T00:01:00Z'
const base = () => ({ orders: [{ id: 'human', version: 9, updated_at: beforeAt, items: [{ id: 'p', kilosReal: 0.8 }], adjustments: [{ type: 'weight' }] }],
  order_creations: [{ order_id: 'human', customer_id: 'human-customer', store_id: 's', key_hash: 'k', snapshot: { value: 'original' } }],
  audit_events: [{ id: 'human-audit', metadata: { version: 9 } }], stores: [{ id: 's', version: 3, updated_at: beforeAt, created_at: beforeAt, name: 'Original' }],
  catalog_categories: [{ id: 'c', version: 1 }], catalog_products: [{ id: 'p', version: 4, updated_at: beforeAt, price: 500 }], })
const record = () => ({ fixtureId: 'fixture-1', runId: 'run-1', readyStamp: 'stamp-1', actorId: 'owner-test', kind: 'product', id: 'p', original: { price: 500 }, restored: true,
  restoreDisposition: 'verified', startedAt: beforeAt, restoredAt: afterAt })
const event = (version: number) => ({ id: `own-${version}`, entity: 'product', entity_id: 'p', action: 'updated', actor_kind: 'account', actor_id: 'owner-test', created_at: afterAt,
  metadata: { version, previousVersion: version - 1, fields: ['price'] } })

test('nuevos pedidos no alteran baseline humana ni sus versiones/fechas/ajustes', () => {
  const current = base(); current.orders.push({ ...current.orders[0]!, id: 'own' })
  expect(Object.values(comparePreservedBaseline(base(), current).checks).every(Boolean)).toBe(true)
  for (const key of ['version', 'updated_at', 'items', 'adjustments']) {
    const changed = base(); Reflect.set(changed.orders[0]!, key, 'changed')
    expect(comparePreservedBaseline(base(), changed).checks.orders).toBe(false)
  }
})

test('creación idempotente y audit humano deben ser idénticos', () => {
  const current = base(); current.order_creations[0]!.snapshot.value = 'changed'
  expect(comparePreservedBaseline(base(), current).checks.order_creations).toBe(false)
  current.audit_events[0]!.metadata.version = 10
  expect(comparePreservedBaseline(base(), current).checks.audit_events).toBe(false)
})

test('metadata de catálogo solo pasa con fixture restaurado y cadena SQL de audit/version', () => {
  const current = base(); current.catalog_products[0]!.version = 6; current.catalog_products[0]!.updated_at = afterAt
  Reflect.set(current, 'audit_events', [...current.audit_events, event(5), event(6)])
  expect(comparePreservedBaseline(base(), current).checks.catalog_products).toBe(false)
  expect(comparePreservedBaseline(base(), current, [record()])).toMatchObject({ checks: { catalog_products: true }, technicalChanges: [{ table: 'catalog_products', previousVersion: 4, version: 6 }] })
  current.catalog_products[0]!.price = 501
  expect(comparePreservedBaseline(base(), current, [record()]).checks.catalog_products).toBe(false)
})

test('no permite cambios globales, otro actor, campo sin fixture ni huecos de audit', () => {
  for (const mutation of [
    (c: ReturnType<typeof base>) => { c.catalog_categories[0]!.version++ },
    (c: ReturnType<typeof base>) => { Reflect.set(c, 'audit_events', [...c.audit_events, { ...event(5), actor_id: 'other' }, event(6)]) },
    (c: ReturnType<typeof base>) => { Reflect.set(c, 'audit_events', [...c.audit_events, { ...event(5), metadata: { ...event(5).metadata, fields: ['inStock'] } }, event(6)]) },
    (c: ReturnType<typeof base>) => { Reflect.set(c, 'audit_events', [...c.audit_events, event(6)]) },
  ]) {
    const current = base(); current.catalog_products[0]!.version = 6; current.catalog_products[0]!.updated_at = afterAt
    Reflect.set(current, 'audit_events', [...current.audit_events, event(5), event(6)]); mutation(current)
    expect(Object.values(comparePreservedBaseline(base(), current, [record()]).checks).every(Boolean)).toBe(false)
  }
})

test('ledger exige hash continuo, corrida consumida y restauración verificada; skipped no autoriza', () => {
  const r = record(), entries = [fixtureLedgerEntry(r)], consumed = { stamps: [{ stamp: 'stamp-1', runId: 'run-1' }] }
  expect(verifiedFixtureRecords(entries, consumed)).toHaveLength(1)
  expect(verifiedFixtureRecords(entries, { stamps: [] })).toHaveLength(0)
  expect(verifiedFixtureRecords([fixtureLedgerEntry({ ...r, restoreDisposition: 'skipped' })], consumed)).toHaveLength(0)
  entries[0].record.id = 'other'
  expect(() => verifiedFixtureRecords(entries, consumed)).toThrow(/Ledger/)
})

test('SQL propio exige ocho pedidos entre dos clientes y unicidad real de referencia/store/claim', () => {
  const orders = Array.from({ length: 8 }, (_, index) => ({ id: `own-${index}`, store_id: 's', customer_id: `customer-${index % 2}`, reference_number: index + 1 }))
  const current = { orders, order_creations: orders.map((row) => ({ order_id: row.id, store_id: row.store_id, customer_id: row.customer_id })) }
  const runtime = { orders: orders.map((row) => ({ orderId: row.id, key: `me-counter.${row.id}` })) }
  const original = { orders: [], stores: [{ id: 's' }] }
  expect(Object.values(verifyOwnOrders(original, current, runtime).checks).every(Boolean)).toBe(true)
  for (const field of ['store_id', 'reference_number', 'customer_id']) {
    const changed = structuredClone(current)
    Reflect.set(changed.orders[0]!, field, field === 'reference_number' ? 2 : 'foreign')
    expect(Object.values(verifyOwnOrders(original, changed, runtime).checks).every(Boolean)).toBe(false)
  }
  const duplicate = structuredClone(current); duplicate.order_creations.push(duplicate.order_creations[0]!)
  expect(verifyOwnOrders(original, duplicate, runtime).checks.creationsExactlyOne).toBe(false)
})
