import { sharedCategories, sharedProducts } from '../../../../shared/catalog/index.js'
import { createOrderRequestSchema } from '../../../../shared/contracts/index.js'
import { DomainError } from '../../shared/errors.js'
import { idempotencyKeyHash, orderIntentFingerprint } from '../orders/createOrder.js'
import {
  SEED_CUSTOMERS,
  SEED_ORDERS,
  SEED_STAFF,
  SEED_STORE,
  orderRequestFor,
  seedOrderKey,
  seedCustomerOf,
  type SeedOrderSpec,
} from './dataset.js'
import { buildSeedManifest } from './manifest.js'
import type { AccountRow, SeedInspector } from './ports.js'

export type SeedConflictKind =
  | 'schema_missing'
  | 'database_identity'
  | 'category_id_other_store'
  | 'category_slug_taken'
  | 'product_id_other_store'
  | 'account_mismatch'
  | 'account_identity_taken'
  | 'order_id_foreign'
  | 'order_claim_mismatch'
  | 'order_fingerprint_changed'

/** Describe QUÉ choca y con qué ID del dataset; nunca refleja valores de la fila ajena. */
export interface SeedConflict {
  kind: SeedConflictKind
  id: string
  detail: string
}

export interface SeedPlan {
  store: 'create' | 'present'
  categoriesToCreate: string[]
  productsToCreate: string[]
  accountsToCreate: string[]
  ordersToCreate: string[]
  ordersPresent: string[]
}

export interface SeedPreflight {
  datasetVersion: string
  contentHash: string
  schema: { missing: string[]; ledgerEntries: number | null }
  conflicts: SeedConflict[]
  plan: SeedPlan
}

/** Aborta el seed antes de escribir: hay filas ajenas con IDs/identidades del dataset o falta el esquema. */
export class SeedPreflightError extends DomainError {
  constructor(public readonly conflicts: readonly SeedConflict[]) {
    super(`Preflight del seed rechazado: ${conflicts.map(conflict => `${conflict.kind}(${conflict.id})`).join(', ')}`, 'SEED_PREFLIGHT_REJECTED')
    this.name = 'SeedPreflightError'
  }
}


const accountSpecs = [
  ...SEED_STAFF.map(spec => ({ id: spec.id, role: spec.role as string, email: spec.email, phone: null as string | null, storeId: spec.storeId as string | null })),
  ...SEED_CUSTOMERS.map(spec => ({ id: spec.id, role: 'customer', email: null as string | null, phone: canonicalPhone(spec.phone), storeId: null as string | null })),
]

function canonicalPhone(phone: string): string {
  return `57${phone}`
}

const accountMismatch = (spec: (typeof accountSpecs)[number], row: AccountRow): string[] => [
  ...(row.role !== spec.role ? ['role'] : []),
  ...(row.email !== spec.email ? ['email'] : []),
  ...(row.phone !== spec.phone ? ['phone'] : []),
  ...(row.storeId !== spec.storeId ? ['storeId'] : []),
  ...(row.status !== 'active' ? ['status'] : []),
]

/** Huella esperada del pedido, con la intención que enviaría la PWA (contrato real de creación). */
const expectedFingerprint = (spec: SeedOrderSpec): string => {
  const customer = seedCustomerOf(spec.customer)
  return orderIntentFingerprint(createOrderRequestSchema.parse(orderRequestFor(spec, customer.id)))
}

/**
 * Preflight de SOLO LECTURA: comprueba esquema y colisiones de IDs/tenants/identidades antes de
 * escribir nada. Una fila existente dentro de la tienda del dataset se trata como propia (el seed
 * no la sobrescribe); una fila con ID del dataset en otra tienda o con otra identidad es ajena
 * y bloquea todo el seed, para no dejarlo a medias.
 */
export const inspectSeed = async (inspector: SeedInspector): Promise<SeedPreflight> => {
  const manifest = buildSeedManifest()
  const conflicts: SeedConflict[] = []
  const schema = await inspector.schemaStatus()
  for (const name of schema.missing) {
    conflicts.push({ kind: 'schema_missing', id: name, detail: 'Falta un objeto del esquema: ejecutar las migraciones antes del seed' })
  }
  const emptyPlan: SeedPlan = { store: 'create', categoriesToCreate: [], productsToCreate: [], accountsToCreate: [], ordersToCreate: [], ordersPresent: [] }
  if (schema.missing.length > 0) {
    return { datasetVersion: manifest.datasetVersion, contentHash: manifest.contentHash, schema, conflicts, plan: emptyPlan }
  }

  const store = (await inspector.hasStore(SEED_STORE)) ? 'present' : 'create'

  const categories = await inspector.findCategories(SEED_STORE, sharedCategories.map(({ id }) => id), sharedCategories.flatMap(({ slug }) => (slug ? [slug] : [])))
  const categoriesToCreate: string[] = []
  for (const category of sharedCategories) {
    const byId = categories.find(row => row.id === category.id)
    const bySlug = category.slug === undefined ? undefined
      : categories.find(row => row.storeId === SEED_STORE && row.slug === category.slug && row.id !== category.id)
    if (byId && byId.storeId !== SEED_STORE) {
      conflicts.push({ kind: 'category_id_other_store', id: category.id, detail: 'El ID de categoría pertenece a otra tienda' })
    } else if (bySlug) {
      conflicts.push({ kind: 'category_slug_taken', id: category.id, detail: 'El slug del dataset lo usa otra categoría de la tienda' })
    } else if (!byId) categoriesToCreate.push(category.id)
  }

  const products = await inspector.findProducts(sharedProducts.map(({ id }) => id))
  const productsToCreate: string[] = []
  for (const product of sharedProducts) {
    const row = products.find(candidate => candidate.id === product.id)
    if (row && row.storeId !== SEED_STORE) {
      conflicts.push({ kind: 'product_id_other_store', id: product.id, detail: 'El ID de producto pertenece a otra tienda' })
    } else if (!row) productsToCreate.push(product.id)
  }

  const accounts = await inspector.findAccounts({
    ids: accountSpecs.map(({ id }) => id),
    emails: accountSpecs.flatMap(({ email }) => (email ? [email] : [])),
    phones: accountSpecs.flatMap(({ phone }) => (phone ? [phone] : [])),
  })
  const accountsToCreate: string[] = []
  for (const spec of accountSpecs) {
    const byId = accounts.find(row => row.id === spec.id)
    const byIdentity = accounts.find(row => row.id !== spec.id &&
      ((spec.email !== null && row.email === spec.email) || (spec.phone !== null && row.phone === spec.phone)))
    if (byIdentity) {
      conflicts.push({ kind: 'account_identity_taken', id: spec.id, detail: 'El email/teléfono del dataset ya pertenece a otra cuenta' })
    } else if (byId) {
      const mismatch = accountMismatch(spec, byId)
      if (mismatch.length > 0) {
        conflicts.push({ kind: 'account_mismatch', id: spec.id, detail: `La cuenta existente difiere del dataset en: ${mismatch.join(', ')}` })
      }
    } else accountsToCreate.push(spec.id)
  }

  const orderIds = SEED_ORDERS.map(({ id }) => id)
  const keyHashes = SEED_ORDERS.map(spec => idempotencyKeyHash(seedOrderKey(spec)))
  const orders = await inspector.findOrders(orderIds)
  const creations = await inspector.findCreations(orderIds, keyHashes)
  const ordersToCreate: string[] = []
  const ordersPresent: string[] = []
  for (const spec of SEED_ORDERS) {
    const customer = seedCustomerOf(spec.customer)
    const keyHash = idempotencyKeyHash(seedOrderKey(spec))
    const row = orders.find(candidate => candidate.id === spec.id)
    const claim = creations.find(candidate => candidate.orderId === spec.id)
    const claimByKey = creations.find(candidate => candidate.customerId === customer.id &&
      candidate.storeId === SEED_STORE && candidate.keyHash === keyHash)
    if (claimByKey && claimByKey.orderId !== spec.id) {
      conflicts.push({ kind: 'order_claim_mismatch', id: spec.id, detail: 'La clave de idempotencia del seed ya creó otro pedido' })
    } else if (!row) ordersToCreate.push(spec.id)
    else if (!claim || claim.customerId !== customer.id || claim.storeId !== SEED_STORE || claim.keyHash !== keyHash ||
      row.customerId !== customer.id || row.storeId !== SEED_STORE) {
      conflicts.push({ kind: 'order_id_foreign', id: spec.id, detail: 'El ID de pedido lo usa una fila que no creó el seed' })
    } else if (claim.fingerprint !== expectedFingerprint(spec)) {
      conflicts.push({ kind: 'order_fingerprint_changed', id: spec.id, detail: 'El pedido sembrado tiene otra huella que el dataset vigente' })
    } else ordersPresent.push(spec.id)
  }

  return {
    datasetVersion: manifest.datasetVersion,
    contentHash: manifest.contentHash,
    schema,
    conflicts,
    plan: { store, categoriesToCreate, productsToCreate, accountsToCreate, ordersToCreate, ordersPresent },
  }
}
