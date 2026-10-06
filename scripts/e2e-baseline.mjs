import { createHash } from 'node:crypto'

const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value
export const baselineDigest = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
const same = (a, b) => baselineDigest(a) === baselineDigest(b)

/** Cadena persistente de fixtures: el archivo privado solo añade estados, nunca reemplaza la historia. */
export function fixtureLedgerEntry(record, previous = []) {
  const body = { sequence: previous.length + 1, previousHash: previous.at(-1)?.hash ?? null, record }
  return { ...body, hash: baselineDigest(body) }
}

export function verifiedFixtureRecords(entries, consumed) {
  const latest = new Map()
  let previousHash = null
  for (const [index, entry] of entries.entries()) {
    const { hash, ...body } = entry
    if (entry.sequence !== index + 1 || entry.previousHash !== previousHash || hash !== baselineDigest(body)) throw new Error('Ledger de fixtures modificado o incompleto')
    previousHash = hash
    if (!entry.record?.fixtureId) throw new Error('Fixture sin identidad')
    latest.set(entry.record.fixtureId, entry.record)
  }
  return [...latest.values()].filter((record) => record.restored === true && record.restoreDisposition === 'verified' &&
    record.actorId && record.runId && record.readyStamp && Number.isFinite(Date.parse(record.startedAt)) &&
    Number.isFinite(Date.parse(record.restoredAt)) && Date.parse(record.restoredAt) >= Date.parse(record.startedAt) &&
    consumed.stamps.some((entry) => entry.runId === record.runId && entry.stamp === record.readyStamp))
}

/**
 * Campo del PATCH de producto (contrato `updateProductRequestSchema`) -> columna SQL real de `catalog_products`.
 * El formulario admin envía el producto completo: el audit lista todos los campos aunque el fixture solo
 * capturó los que cambió. Un campo ausente de `original` solo se admite si está en este mapa, su columna
 * existe en la fila original y en la actual, y el valor restaurado es idéntico al de la baseline inmutable.
 */
export const PRODUCT_FIELD_COLUMNS = Object.freeze({
  name: 'name', name_display: 'display_name', name_legal: 'legal_name', price: 'price', originalPrice: 'original_price',
  unit: 'unit', imageUrl: 'image_url', categoryId: 'category_id', inStock: 'in_stock', is_variable_weight: 'is_variable_weight',
  badge: 'badge', currency: 'currency', description: 'description', nutritionalInfo: 'nutritional_info',
  availability: 'availability_label', active: 'active', archived: 'archived_at',
})

/** Solo metadata de filas realmente tocadas, restauradas y respaldadas por audit/versiones SQL. */
function fixtureMetadataAllowed(table, before, after, records, audits) {
  const entity = table === 'stores' ? 'store' : table === 'catalog_products' ? 'product' : null
  if (!entity || !Number.isInteger(before.version) || !Number.isInteger(after.version) || after.version <= before.version ||
    !Number.isFinite(Date.parse(after.updated_at)) || !Number.isFinite(Date.parse(before.updated_at)) ||
    Date.parse(after.updated_at) < Date.parse(before.updated_at)) return false
  const touched = records.filter((record) => record.kind === (entity === 'store' ? 'store' : 'product') && record.id === before.id)
  if (!touched.length) return false
  const events = audits.filter((event) => event.entity === entity && event.entity_id === before.id && event.action === 'updated' &&
    event.metadata?.version > before.version && event.metadata.version <= after.version).sort((a, b) => a.metadata.version - b.metadata.version)
  if (events.length !== after.version - before.version) return false
  return events.every((event, index) => event.metadata.previousVersion === before.version + index && event.metadata.version === before.version + index + 1 &&
    event.actor_kind === 'account' && touched.some((record) => event.actor_id === record.actorId &&
      Date.parse(event.created_at) >= Date.parse(record.startedAt) - 2_000 && Date.parse(event.created_at) <= Date.parse(record.restoredAt) + 2_000 &&
      Array.isArray(event.metadata.fields) && event.metadata.fields.length > 0 &&
      event.metadata.fields.every((field) => Object.hasOwn(record.original, field) ||
        (entity === 'product' && Object.hasOwn(PRODUCT_FIELD_COLUMNS, field) &&
          Object.hasOwn(before, PRODUCT_FIELD_COLUMNS[field]) && Object.hasOwn(after, PRODUCT_FIELD_COLUMNS[field]) &&
          same(before[PRODUCT_FIELD_COLUMNS[field]], after[PRODUCT_FIELD_COLUMNS[field]])))))
}

/** Todas las filas humanas se buscan por identidad privada y se comparan íntegras, aunque haya pedidos nuevos. */
export function comparePreservedBaseline(base, current, records = []) {
  const checks = {}, technicalChanges = []
  const newAudit = current.audit_events.filter((event) => !base.audit_events.some((old) => old.id === event.id))
  for (const [table, originals] of Object.entries(base)) {
    checks[table] = (!['stores', 'catalog_products', 'catalog_categories'].includes(table) || current[table]?.length === originals.length) && originals.every((original) => {
      const row = (current[table] ?? []).find((value) => table === 'order_creations'
        ? value.order_id === original.order_id && value.key_hash === original.key_hash && value.customer_id === original.customer_id && value.store_id === original.store_id
        : value.id === original.id)
      if (!row) return false
      const projection = Object.fromEntries(Object.keys(original).map((key) => [key, row[key]]))
      if (same(original, projection)) return true
      if (!fixtureMetadataAllowed(table, original, row, records, newAudit)) return false
      const withoutMetadata = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'version' && key !== 'updated_at'))
      if (!same(withoutMetadata(original), withoutMetadata(projection))) return false
      technicalChanges.push({ table, id: original.id, previousVersion: original.version, version: row.version })
      return true
    })
  }
  return { checks, technicalChanges }
}

/** Pedidos propios de contención: dos cuentas reales, una tienda y una creación por pedido/referencia. */
export function verifyOwnOrders(base, current, runtime, previousOwnedIds = []) {
  const originalIds = new Set(base.orders.map((row) => row.id))
  const own = current.orders.filter((row) => !originalIds.has(row.id))
  const recorded = new Set(runtime.orders.filter((entry) => entry.orderId).map((entry) => entry.orderId))
  const storeId = base.stores.length === 1 ? base.stores[0].id : null
  const counters = runtime.orders.filter((entry) => entry.key.startsWith('me-counter.'))
    .map((entry) => own.find((row) => row.id === entry.orderId))
  const checks = {
    recordedRowsPresent: [...recorded].every((id) => own.some((row) => row.id === id)),
    allOwnRowsRecorded: own.every((row) => recorded.has(row.id) || previousOwnedIds.includes(row.id)),
    storeScope: Boolean(storeId) && own.every((row) => row.store_id === storeId),
    uniqueReferences: own.every((row) => Number.isInteger(row.reference_number) && row.reference_number > 0) &&
      new Set(current.orders.map((row) => row.reference_number)).size === current.orders.length,
    creationsExactlyOne: own.every((row) => {
      const entries = current.order_creations.filter((entry) => entry.order_id === row.id)
      return entries.length === 1 && entries[0].store_id === storeId && entries[0].customer_id === row.customer_id
    }),
    counterEightTwoAccounts: counters.length === 8 && counters.every(Boolean) && new Set(counters.map((row) => row?.customer_id)).size === 2,
  }
  return { checks, ownOrderCount: own.length, recordedOrderCount: recorded.size, concurrentOrderCount: counters.filter(Boolean).length }
}
