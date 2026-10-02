import { auditVersion, type AuditWrite } from '../../domain/audit/AuditRepository.js'
import { AuditRepositoryMemory } from './AuditRepositoryMemory.js'
import { isPubliclyVisible, type CatalogCategory, type CatalogProduct } from '../../domain/catalog/Catalog.js'
import type { CatalogRepository, ProductVisibility } from '../../domain/catalog/CatalogRepository.js'
import { CatalogConflictError, UnknownCategoryError } from '../../domain/catalog/errors.js'

/** Comparación por unidades de código, equivalente a `COLLATE "C"` del adapter Postgres. */
const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const categoryOrder = (a: CatalogCategory, b: CatalogCategory): number =>
  (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
  byCode(a.createdAt, b.createdAt) ||
  byCode(a.id, b.id)

const productOrder = (a: CatalogProduct, b: CatalogProduct): number =>
  byCode(a.createdAt, b.createdAt) || byCode(a.id, b.id)

/**
 * Adapter en memoria que reproduce las restricciones de Postgres: categoría de la misma
 * tienda, borrado restringido por productos, slug único por tienda, tienda existente y
 * escrituras condicionadas por versión. Solo tests/dev local; no acredita SQL.
 */
export class CatalogRepositoryMemory implements CatalogRepository {
  private readonly categories = new Map<string, CatalogCategory>()
  private readonly products = new Map<string, CatalogProduct>()

  constructor(private readonly storeExists: (storeId: string) => boolean, private readonly audit = new AuditRepositoryMemory()) {}

  async listCategories(storeId: string): Promise<CatalogCategory[]> {
    return [...this.categories.values()].filter((c) => c.storeId === storeId).sort(categoryOrder).map((c) => ({ ...c }))
  }

  async findCategory(storeId: string, id: string): Promise<CatalogCategory | null> {
    const found = this.categories.get(id)
    return found && found.storeId === storeId ? { ...found } : null
  }

  async createCategory(category: CatalogCategory, audit?: AuditWrite): Promise<CatalogCategory> {
    if (this.categories.has(category.id)) throw new CatalogConflictError('CATALOG_ID_TAKEN')
    this.assertCategoryWritable(category)
    this.audit.append('category', 'created', category.storeId, category.id, auditVersion(audit, category.version, false))
    this.categories.set(category.id, { ...category })
    return { ...category }
  }

  async updateCategory(category: CatalogCategory, expectedVersion: number, audit?: AuditWrite): Promise<CatalogCategory | null> {
    const current = this.categories.get(category.id)
    if (!current || current.storeId !== category.storeId || current.version !== expectedVersion) return null
    this.assertCategoryWritable(category)
    this.audit.append('category', 'updated', category.storeId, category.id, auditVersion(audit, category.version, true))
    this.categories.set(category.id, { ...category })
    return { ...category }
  }

  async deleteCategory(storeId: string, id: string, audit?: AuditWrite): Promise<boolean> {
    const current = this.categories.get(id)
    if (!current || current.storeId !== storeId) return false
    if ([...this.products.values()].some((p) => p.storeId === storeId && p.categoryId === id)) {
      throw new CatalogConflictError('CATEGORY_IN_USE')
    }
    this.audit.append('category', 'deleted', current.storeId, current.id, auditVersion(audit, current.version, false))
    this.categories.delete(id)
    return true
  }

  async listProducts(storeId: string, visibility: ProductVisibility): Promise<CatalogProduct[]> {
    return [...this.products.values()]
      .filter((p) => p.storeId === storeId && (visibility === 'all' || isPubliclyVisible(p)))
      .sort(productOrder)
      .map((p) => structuredClone(p))
  }

  async findProduct(storeId: string, id: string): Promise<CatalogProduct | null> {
    const found = this.products.get(id)
    return found && found.storeId === storeId ? structuredClone(found) : null
  }

  async createProduct(product: CatalogProduct, audit?: AuditWrite): Promise<CatalogProduct> {
    if (this.products.has(product.id)) throw new CatalogConflictError('CATALOG_ID_TAKEN')
    this.assertCategoryOfStore(product)
    this.audit.append('product', 'created', product.storeId, product.id, auditVersion(audit, product.version, false))
    this.products.set(product.id, structuredClone(product))
    return structuredClone(product)
  }

  async updateProduct(product: CatalogProduct, expectedVersion: number, audit?: AuditWrite): Promise<CatalogProduct | null> {
    const current = this.products.get(product.id)
    if (!current || current.storeId !== product.storeId || current.version !== expectedVersion) return null
    this.assertCategoryOfStore(product)
    this.audit.append('product', 'updated', product.storeId, product.id, auditVersion(audit, product.version, true))
    this.products.set(product.id, structuredClone(product))
    return structuredClone(product)
  }

  async insertCategoryIfAbsent(category: CatalogCategory): Promise<boolean> {
    if (this.categories.has(category.id) || this.slugTaken(category)) return false
    if (!this.storeExists(category.storeId)) throw new CatalogConflictError('STORE_NOT_CONFIGURED')
    this.audit.append('category', 'created', category.storeId, category.id, auditVersion(undefined, category.version, false))
    this.categories.set(category.id, { ...category })
    return true
  }

  async insertProductIfAbsent(product: CatalogProduct): Promise<boolean> {
    if (this.products.has(product.id)) return false
    this.assertCategoryOfStore(product)
    this.audit.append('product', 'created', product.storeId, product.id, auditVersion(undefined, product.version, false))
    this.products.set(product.id, structuredClone(product))
    return true
  }

  private slugTaken(category: CatalogCategory): boolean {
    return (
      category.slug !== null &&
      [...this.categories.values()].some(
        (c) => c.id !== category.id && c.storeId === category.storeId && c.slug === category.slug,
      )
    )
  }

  private assertCategoryWritable(category: CatalogCategory): void {
    if (!this.storeExists(category.storeId)) throw new CatalogConflictError('STORE_NOT_CONFIGURED')
    if (this.slugTaken(category)) throw new CatalogConflictError('CATEGORY_SLUG_TAKEN')
  }

  private assertCategoryOfStore(product: CatalogProduct): void {
    if (this.categories.get(product.categoryId)?.storeId !== product.storeId) throw new UnknownCategoryError()
  }
}
