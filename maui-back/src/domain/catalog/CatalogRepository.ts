import type { CatalogCategory, CatalogProduct } from './Catalog.js'

/** `public`: solo activos y no archivados. `all`: vista de personal. */
export type ProductVisibility = 'public' | 'all'

/**
 * Persistencia del catálogo. Toda lectura y escritura está acotada por `storeId`: un ID de
 * otra tienda se comporta como inexistente. Las invariantes entre filas (categoría de la
 * misma tienda, categoría referenciada no borrable) las garantiza el adapter de forma
 * atómica; en Postgres con claves foráneas, no con lecturas previas.
 */
export interface CatalogRepository {
  /** Orden: `order` ascendente (sin orden al final), luego creación e ID. */
  listCategories(storeId: string): Promise<CatalogCategory[]>
  findCategory(storeId: string, id: string): Promise<CatalogCategory | null>
  /** `STORE_NOT_CONFIGURED` si la tienda no existe; `CATEGORY_SLUG_TAKEN` si el slug se repite. */
  createCategory(category: CatalogCategory): Promise<CatalogCategory>
  /** Escribe solo si la versión persistida es `expectedVersion`; `null` si cambió o no existe. */
  updateCategory(category: CatalogCategory, expectedVersion: number): Promise<CatalogCategory | null>
  /** `false` si no existe en la tienda; `CATEGORY_IN_USE` si un producto (incluso archivado) la usa. */
  deleteCategory(storeId: string, id: string): Promise<boolean>

  /** Orden: creación e ID (el seed conserva el orden del baseline). */
  listProducts(storeId: string, visibility: ProductVisibility): Promise<CatalogProduct[]>
  findProduct(storeId: string, id: string): Promise<CatalogProduct | null>
  /** `UnknownCategoryError` si la categoría no existe en la tienda del producto. */
  createProduct(product: CatalogProduct): Promise<CatalogProduct>
  /** Igual que `updateCategory`; también valida la categoría de la misma tienda. */
  updateProduct(product: CatalogProduct, expectedVersion: number): Promise<CatalogProduct | null>

  /** Seed idempotente: inserta solo si el ID (o el slug) no existe y nunca sobrescribe. */
  insertCategoryIfAbsent(category: CatalogCategory): Promise<boolean>
  insertProductIfAbsent(product: CatalogProduct): Promise<boolean>
}
