import type { AuditWrite } from '../../domain/audit/AuditRepository.js'
import { auditedWrite } from './auditedWrite.js'
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { CATALOG_CURRENCY, normalizeIsoUtc, nutritionalInfoSchema } from '../../../../shared/contracts/index.js'
import type { CatalogCategory, CatalogProduct } from '../../domain/catalog/Catalog.js'
import type { CatalogRepository, ProductVisibility } from '../../domain/catalog/CatalogRepository.js'
import { CatalogConflictError, CatalogPersistenceError, UnknownCategoryError } from '../../domain/catalog/errors.js'
import { DomainError, ValidationError } from '../../shared/errors.js'
import type { Db } from './client.js'
import { catalogCategoriesTable, catalogProductsTable } from './schema.js'

type CategoryRow = typeof catalogCategoriesTable.$inferSelect
type ProductRow = typeof catalogProductsTable.$inferSelect

const FOREIGN_KEY_VIOLATION = '23503'
/** ON DELETE RESTRICT reporta `restrict_violation` (no 23503) en PostgreSQL vigente. */
const RESTRICT_VIOLATION = '23001'
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'

const sqlStateOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined

type Translate = (sqlState: string | undefined) => Error | undefined

/**
 * Traduce SQLSTATE de restricciones conocidas a errores de dominio; cualquier otro fallo del
 * driver/SQL se reduce a `CatalogPersistenceError` (503) sin propagar URL, SQL ni datos.
 */
const guard = async <T>(operation: () => Promise<T>, translate?: Translate): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw translate?.(sqlStateOf(error)) ?? new CatalogPersistenceError()
  }
}

const productWriteErrors: Translate = (state) => {
  if (state === FOREIGN_KEY_VIOLATION) return new UnknownCategoryError()
  if (state === UNIQUE_VIOLATION) return new CatalogConflictError('CATALOG_ID_TAKEN')
  if (state === CHECK_VIOLATION) return new ValidationError('Producto incoherente con las reglas de precio/unidad')
  return undefined
}

const categoryWriteErrors: Translate = (state) => {
  if (state === FOREIGN_KEY_VIOLATION) return new CatalogConflictError('STORE_NOT_CONFIGURED')
  if (state === UNIQUE_VIOLATION) return new CatalogConflictError('CATEGORY_SLUG_TAKEN')
  return undefined
}

const toCategory = (row: CategoryRow): CatalogCategory => ({
  id: row.id,
  storeId: row.storeId,
  name: row.name,
  icon: row.icon,
  slug: row.slug,
  illustrationUrl: row.illustrationUrl,
  order: row.sortOrder,
  version: row.version,
  createdAt: normalizeIsoUtc(row.createdAt),
  updatedAt: normalizeIsoUtc(row.updatedAt),
})

const categoryValues = (category: CatalogCategory): typeof catalogCategoriesTable.$inferInsert => ({
  id: category.id,
  storeId: category.storeId,
  name: category.name,
  icon: category.icon,
  slug: category.slug,
  illustrationUrl: category.illustrationUrl,
  sortOrder: category.order,
  version: category.version,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
})

const toProduct = (row: ProductRow): CatalogProduct => {
  if (row.currency !== CATALOG_CURRENCY) throw new Error('Invalid product currency')
  return {
    id: row.id,
    storeId: row.storeId,
    categoryId: row.categoryId,
    name: row.name,
    displayName: row.displayName,
    legalName: row.legalName,
    price: row.price,
    originalPrice: row.originalPrice,
    unit: row.unit,
    imageUrl: row.imageUrl,
    inStock: row.inStock,
    isVariableWeight: row.isVariableWeight,
    badge: row.badge,
    currency: CATALOG_CURRENCY,
    description: row.description,
    nutritionalInfo: row.nutritionalInfo === null ? null : nutritionalInfoSchema.parse(row.nutritionalInfo),
    availability: row.availability,
    active: row.active,
    archivedAt: row.archivedAt === null ? null : normalizeIsoUtc(row.archivedAt),
    version: row.version,
    createdAt: normalizeIsoUtc(row.createdAt),
    updatedAt: normalizeIsoUtc(row.updatedAt),
  }
}

const productValues = (product: CatalogProduct): typeof catalogProductsTable.$inferInsert => ({
  id: product.id,
  storeId: product.storeId,
  categoryId: product.categoryId,
  name: product.name,
  displayName: product.displayName,
  legalName: product.legalName,
  price: product.price,
  originalPrice: product.originalPrice,
  unit: product.unit,
  imageUrl: product.imageUrl,
  inStock: product.inStock,
  isVariableWeight: product.isVariableWeight,
  badge: product.badge,
  currency: product.currency,
  description: product.description,
  nutritionalInfo: product.nutritionalInfo,
  availability: product.availability,
  active: product.active,
  archivedAt: product.archivedAt,
  version: product.version,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
})

/** Desempate por ID con orden binario, igual que el adapter memory. */
const byIdBinary = (column: typeof catalogCategoriesTable.id | typeof catalogProductsTable.id): SQL =>
  sql`${column} collate "C"`

/**
 * Adapter Drizzle sobre Neon HTTP (sin transacciones interactivas). Cada invariante es una
 * sola sentencia: FK compuesta y RESTRICT para categorías, CHECK para precio/unidad y UPDATE
 * condicionado por versión. Todas las consultas filtran por `store_id`.
 */
export class CatalogRepositoryPostgres implements CatalogRepository {
  constructor(private readonly db: Db) {}

  listCategories(storeId: string): Promise<CatalogCategory[]> {
    return guard(async () => {
      const t = catalogCategoriesTable
      const rows = await this.db
        .select()
        .from(t)
        .where(eq(t.storeId, storeId))
        .orderBy(sql`${t.sortOrder} asc nulls last`, asc(t.createdAt), byIdBinary(t.id))
      return rows.map(toCategory)
    })
  }

  findCategory(storeId: string, id: string): Promise<CatalogCategory | null> {
    return guard(async () => {
      const t = catalogCategoriesTable
      const [row] = await this.db.select().from(t).where(and(eq(t.storeId, storeId), eq(t.id, id))).limit(1)
      return row ? toCategory(row) : null
    })
  }

  createCategory(category: CatalogCategory, audit?: AuditWrite): Promise<CatalogCategory> {
    return guard(async () => {
      const [row] = await auditedWrite(this.db, catalogCategoriesTable, this.db.insert(catalogCategoriesTable).values(categoryValues(category)).returning(), 'category', 'created', category.storeId, audit)
      if (!row) throw new Error('Insert failed')
      return toCategory(row)
    }, categoryWriteErrors)
  }

  updateCategory(category: CatalogCategory, expectedVersion: number, audit?: AuditWrite): Promise<CatalogCategory | null> {
    return guard(async () => {
      const t = catalogCategoriesTable
      const { id: _id, storeId: _storeId, createdAt: _createdAt, ...changes } = categoryValues(category)
      const [row] = await auditedWrite(this.db, t, this.db
        .update(t)
        .set(changes)
        .where(and(eq(t.id, category.id), eq(t.storeId, category.storeId), eq(t.version, expectedVersion)))
        .returning(), 'category', 'updated', category.storeId, audit)
      return row ? toCategory(row) : null
    }, categoryWriteErrors)
  }

  deleteCategory(storeId: string, id: string, audit?: AuditWrite): Promise<boolean> {
    return guard(
      async () => {
        const t = catalogCategoriesTable
        const deleted = await auditedWrite(this.db, t, this.db
          .delete(t)
          .where(and(eq(t.storeId, storeId), eq(t.id, id)))
          .returning(), 'category', 'deleted', storeId, audit)
        return deleted.length > 0
      },
      (state) =>
        state === RESTRICT_VIOLATION || state === FOREIGN_KEY_VIOLATION
          ? new CatalogConflictError('CATEGORY_IN_USE')
          : undefined,
    )
  }

  listProducts(storeId: string, visibility: ProductVisibility): Promise<CatalogProduct[]> {
    return guard(async () => {
      const t = catalogProductsTable
      const conditions = [eq(t.storeId, storeId)]
      if (visibility === 'public') conditions.push(eq(t.active, true), isNull(t.archivedAt))
      const rows = await this.db
        .select()
        .from(t)
        .where(and(...conditions))
        .orderBy(asc(t.createdAt), byIdBinary(t.id))
      return rows.map(toProduct)
    })
  }

  findProduct(storeId: string, id: string): Promise<CatalogProduct | null> {
    return guard(async () => {
      const t = catalogProductsTable
      const [row] = await this.db.select().from(t).where(and(eq(t.storeId, storeId), eq(t.id, id))).limit(1)
      return row ? toProduct(row) : null
    })
  }

  createProduct(product: CatalogProduct, audit?: AuditWrite): Promise<CatalogProduct> {
    return guard(async () => {
      const [row] = await auditedWrite(this.db, catalogProductsTable, this.db.insert(catalogProductsTable).values(productValues(product)).returning(), 'product', 'created', product.storeId, audit)
      if (!row) throw new Error('Insert failed')
      return toProduct(row)
    }, productWriteErrors)
  }

  updateProduct(product: CatalogProduct, expectedVersion: number, audit?: AuditWrite): Promise<CatalogProduct | null> {
    return guard(async () => {
      const t = catalogProductsTable
      const { id: _id, storeId: _storeId, createdAt: _createdAt, ...changes } = productValues(product)
      const [row] = await auditedWrite(this.db, t, this.db
        .update(t)
        .set(changes)
        .where(and(eq(t.id, product.id), eq(t.storeId, product.storeId), eq(t.version, expectedVersion)))
        .returning(), 'product', 'updated', product.storeId, audit)
      return row ? toProduct(row) : null
    }, productWriteErrors)
  }

  insertCategoryIfAbsent(category: CatalogCategory): Promise<boolean> {
    return guard(async () => {
      // Sin target: un ID o slug ya existentes dejan la fila previa intacta.
      const inserted = await auditedWrite(this.db, catalogCategoriesTable, this.db
        .insert(catalogCategoriesTable)
        .values(categoryValues(category))
        .onConflictDoNothing()
        .returning(), 'category', 'created', category.storeId)
      return inserted.length > 0
    }, categoryWriteErrors)
  }

  insertProductIfAbsent(product: CatalogProduct): Promise<boolean> {
    return guard(async () => {
      const inserted = await auditedWrite(this.db, catalogProductsTable, this.db
        .insert(catalogProductsTable)
        .values(productValues(product))
        .onConflictDoNothing({ target: catalogProductsTable.id })
        .returning(), 'product', 'created', product.storeId)
      return inserted.length > 0
    }, productWriteErrors)
  }
}
