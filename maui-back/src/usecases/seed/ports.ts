/**
 * Lecturas de solo lectura que necesita el preflight del seed y del reset (T-16). Devuelven filas
 * mínimas (IDs, tienda e identidad), nunca contraseñas ni datos personales de pedidos. La
 * implementación PostgreSQL vive en `infra/postgres/SeedStorePostgres.ts`.
 */

export interface SeedSchemaStatus {
  /** Tablas o funciones esperadas que no existen: las migraciones no están aplicadas. */
  missing: string[]
  /** Filas del ledger de Drizzle; `null` si no existe (p. ej. SQL embebido de las pruebas). */
  ledgerEntries: number | null
}

export interface CategoryRow {
  id: string
  storeId: string
  slug: string | null
}

export interface ProductRow {
  id: string
  storeId: string
  categoryId: string
}

export interface AccountRow {
  id: string
  role: string
  email: string | null
  phone: string | null
  storeId: string | null
  status: string
}

export interface OrderRow {
  id: string
  storeId: string
  customerId: string
}

export interface CreationRow {
  orderId: string
  customerId: string
  storeId: string
  keyHash: string
  fingerprint: string
}

export interface SeedInspector {
  databaseName(): Promise<string>
  schemaStatus(): Promise<SeedSchemaStatus>
  hasStore(storeId: string): Promise<boolean>
  /** Categorías con esos IDs o con esos slugs dentro de `storeId`. */
  findCategories(storeId: string, ids: readonly string[], slugs: readonly string[]): Promise<CategoryRow[]>
  findProducts(ids: readonly string[]): Promise<ProductRow[]>
  /** Cuentas que coinciden por ID, email o teléfono. */
  findAccounts(identity: { ids: readonly string[]; emails: readonly string[]; phones: readonly string[] }): Promise<AccountRow[]>
  findOrders(ids: readonly string[]): Promise<OrderRow[]>
  /** Claims de idempotencia de esos pedidos o de esas claves. */
  findCreations(orderIds: readonly string[], keyHashes: readonly string[]): Promise<CreationRow[]>
}

/** Qué filas toca el reset: solo las del dataset, identificadas por ID y por identidad esperada. */
export interface FixtureScope {
  storeId: string
  orderIds: readonly string[]
  productIds: readonly string[]
  categoryIds: readonly string[]
  accounts: readonly { id: string; role: string; email: string | null; phone: string | null; storeId: string | null }[]
  /** Buckets de cuota de creación de pedidos de los clientes de test. */
  rateLimitBuckets: readonly string[]
  /** Incluye la fila de la tienda y su historial; por defecto la configuración de la tienda se conserva. */
  includeStore: boolean
}

export interface FixtureCounts {
  auditEvents: number
  orders: number
  orderClaims: number
  sessions: number
  accounts: number
  rateLimits: number
  products: number
  categories: number
  store: number
}

export interface ResetBlocker {
  kind: string
  count: number
}

export interface ResetMeasure {
  toDelete: FixtureCounts
  /** Pedidos de clientes de test que no son del dataset: se conservan (quedan sin cuenta hasta resembrar). */
  retainedCustomerOrders: number
  /** Filas ajenas que impiden borrar de forma segura; con alguna, el reset no se ejecuta. */
  blockers: ResetBlocker[]
}

export interface SeedEraser {
  measure(scope: FixtureScope): Promise<ResetMeasure>
  /** Borrado ordenado y atómico (una transacción) de lo medido. */
  erase(scope: FixtureScope): Promise<void>
}
