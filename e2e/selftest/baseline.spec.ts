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

// Formulario admin completo: el audit lista 14 campos aunque el fixture solo capturó `price`.
const FORM_FIELDS = ['name', 'name_display', 'name_legal', 'price', 'originalPrice', 'unit', 'imageUrl', 'categoryId', 'inStock', 'is_variable_weight', 'badge', 'description', 'nutritionalInfo', 'availability']
const fullProduct = () => ({ id: 'p', version: 4, updated_at: beforeAt, price: 500, name: 'Original', display_name: null, legal_name: 'Legal', original_price: null, unit: 'u', image_url: 'x',
  category_id: 'c', in_stock: true, is_variable_weight: false, badge: null, currency: 'COP', description: 'd', nutritional_info: { kcal: 1 }, availability_label: null, active: true, archived_at: null })
const formState = (mutate?: (current: ReturnType<typeof full>, events: ReturnType<typeof event>[]) => void) => {
  const events = [event(5), { ...event(6), metadata: { version: 6, previousVersion: 5, fields: FORM_FIELDS } }, event(7)]
  const current = full(); Object.assign(current.catalog_products[0]!, { version: 7, updated_at: afterAt })
  mutate?.(current, events); Reflect.set(current, 'audit_events', [...current.audit_events, ...events]); return current
}
const full = () => ({ ...base(), catalog_products: [fullProduct()] as Record<string, unknown>[] })
const fullBase = () => full()
const withRecord = (r = record()) => [r]

test('formulario de 14 campos con baseline completa, ledger contiguo y valores restaurados acepta solo metadata', () => {
  expect(comparePreservedBaseline(fullBase(), formState(), withRecord())).toMatchObject({ checks: { catalog_products: true }, technicalChanges: [{ table: 'catalog_products', previousVersion: 4, version: 7 }] })
  expect(comparePreservedBaseline(fullBase(), formState()).checks.catalog_products).toBe(false)
})

test('formulario completo rechaza campo desconocido, valor de negocio cambiado, columna ausente, hueco, actor, ventana y ledger alterado', () => {
  const rejected: Array<(current: ReturnType<typeof full>, events: ReturnType<typeof event>[]) => void> = [
    (_c, e) => { e[1]!.metadata.fields = [...FORM_FIELDS, 'weeklySchedule'] },
    (_c, e) => { e[1]!.metadata.fields = [...FORM_FIELDS, 'unknownField'] },
    (c) => { c.catalog_products[0]!.name = 'Cambiado' },
    (c) => { c.catalog_products[0]!.nutritional_info = { kcal: 2 } },
    (c) => { delete c.catalog_products[0]!.legal_name },
    (_c, e) => { e.splice(1, 1) },
    (_c, e) => { e[1]!.actor_id = 'other' },
    (_c, e) => { e[1]!.created_at = '2026-10-07T00:00:00Z' },
    (_c, e) => { e.push({ ...event(6), id: 'dup-6' }) },
  ]
  for (const mutate of rejected) expect(comparePreservedBaseline(fullBase(), formState(mutate), withRecord()).checks.catalog_products).toBe(false)
  // Una columna ausente también en la baseline no cuenta como valor restaurado.
  const noColumn = fullBase(); delete noColumn.catalog_products[0]!.legal_name
  expect(comparePreservedBaseline(noColumn, formState((c) => { delete c.catalog_products[0]!.legal_name }), withRecord()).checks.catalog_products).toBe(false)
  // Ledger alterado: la cadena deja de verificarse y no hay registros que respalden la metadata.
  const entries = [fixtureLedgerEntry(record())], consumed = { stamps: [{ stamp: 'stamp-1', runId: 'run-1' }] }
  entries[0]!.record.original = { price: 1 }
  expect(() => verifiedFixtureRecords(entries, consumed)).toThrow(/Ledger/)
})

test('el guard de store conserva el criterio previo: campo ausente del fixture no se admite', () => {
  const store = { ...base(), stores: [{ id: 's', version: 3, updated_at: beforeAt, created_at: beforeAt, name: 'Original', contact_phone: 'x' }] }
  const current = structuredClone(store); Object.assign(current.stores[0]!, { version: 4, updated_at: afterAt })
  Reflect.set(current, 'audit_events', [...current.audit_events, { id: 's-4', entity: 'store', entity_id: 's', action: 'updated', actor_kind: 'account', actor_id: 'owner-test', created_at: afterAt, metadata: { version: 4, previousVersion: 3, fields: ['contactPhone'] } }])
  expect(comparePreservedBaseline(store, current, [{ ...record(), kind: 'store', id: 's', original: { name: 'Original' } }]).checks.stores).toBe(false)
})
