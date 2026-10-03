import { createHash } from 'node:crypto'
import { sharedCategories, sharedProducts } from '../../../../shared/catalog/index.js'
import {
  SEED_CUSTOMERS,
  SEED_DATASET_VERSION,
  SEED_EPOCH,
  SEED_ORDERS,
  SEED_STAFF,
  SEED_STORE,
  SEED_STORE_SETTINGS,
  finalStatusOf,
} from './dataset.js'

/** JSON con claves ordenadas: la misma estructura produce siempre los mismos bytes. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex')

export interface SeedManifest {
  datasetVersion: string
  /** Hash de TODO el contenido del dataset (catálogo, tienda, cuentas sin secretos y pedidos). */
  contentHash: string
  storeId: string
  counts: { categories: number; products: number; accounts: number; orders: number }
  accounts: { id: string; role: string; identity: string }[]
  orders: { id: string; customerId: string; deliveryType: string; finalStatus: string; steps: number }[]
}

/**
 * Manifiesto determinista y sin secretos: identifica la versión y los fixtures sembrados.
 * Cualquier cambio de catálogo, tienda, cuentas o pedidos cambia `contentHash`.
 */
export const buildSeedManifest = (): SeedManifest => {
  const content = {
    datasetVersion: SEED_DATASET_VERSION,
    epoch: SEED_EPOCH,
    store: { id: SEED_STORE, settings: SEED_STORE_SETTINGS },
    categories: sharedCategories,
    products: sharedProducts,
    staff: SEED_STAFF,
    customers: SEED_CUSTOMERS,
    orders: SEED_ORDERS,
  }
  return {
    datasetVersion: SEED_DATASET_VERSION,
    contentHash: sha256Hex(canonicalJson(content)),
    storeId: SEED_STORE,
    counts: {
      categories: sharedCategories.length,
      products: sharedProducts.length,
      accounts: SEED_STAFF.length + SEED_CUSTOMERS.length,
      orders: SEED_ORDERS.length,
    },
    accounts: [
      ...SEED_STAFF.map(({ id, role, email }) => ({ id, role, identity: email })),
      ...SEED_CUSTOMERS.map(({ id, phone }) => ({ id, role: 'customer', identity: phone })),
    ],
    orders: SEED_ORDERS.map(spec => ({
      id: spec.id,
      customerId: SEED_CUSTOMERS.find(customer => customer.key === spec.customer)?.id ?? '',
      deliveryType: spec.request.deliveryType,
      finalStatus: finalStatusOf(spec),
      steps: spec.steps.length,
    })),
  }
}
