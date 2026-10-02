import { auditFor } from '../../domain/audit/AuditRepository.js'
import type { AuditMetadata } from '../../../../shared/contracts/audit.js'
import {
  CATALOG_CURRENCY,
  VARIABLE_WEIGHT_UNIT,
  createProductRequestSchema,
  issuesFromZodError,
  productRuleIssues,
  updateProductRequestSchema,
} from '../../../../shared/contracts/index.js'
import type { CatalogProduct } from '../../domain/catalog/Catalog.js'
import type { CatalogRepository } from '../../domain/catalog/CatalogRepository.js'
import { CatalogConflictError, UnknownCategoryError } from '../../domain/catalog/errors.js'
import { ownedStoreOf, type StoreActor } from '../../domain/store/storeAccess.js'
import type { Clock } from '../../shared/clock.js'
import { NotFoundError, ValidationError } from '../../shared/errors.js'
import { newId } from '../../shared/ids.js'

export interface ManageProductsDeps {
  catalog: Pick<CatalogRepository, 'findCategory' | 'findProduct' | 'createProduct' | 'updateProduct'>
  clock: Clock
}

const assertCategoryInStore = async (deps: ManageProductsDeps, storeId: string, categoryId: string): Promise<void> => {
  // Comprobación previa para un error claro; la FK compuesta (tienda, categoría) es la garantía.
  if (!(await deps.catalog.findCategory(storeId, categoryId))) throw new UnknownCategoryError()
}

/** Peso variable siempre usa la unidad por kg; peso fijo conserva la suya (la regla ya exige que exista). */
export const resolveUnit = (isVariableWeight: boolean, unit: string | undefined): string => {
  if (isVariableWeight) return VARIABLE_WEIGHT_UNIT
  if (unit === undefined) throw new ValidationError('Invalid product', [{ path: 'unit', message: 'Requerida en productos de peso fijo' }])
  return unit
}

/**
 * Alta de producto por el owner en SU tienda. ID asignado por el servidor; categoría de la
 * misma tienda; `inStock`/`active` por defecto `true`.
 */
export const createProduct = async (
  deps: ManageProductsDeps,
  actor: StoreActor,
  input: unknown,
): Promise<CatalogProduct> => {
  const storeId = ownedStoreOf(actor)
  const parsed = createProductRequestSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Invalid product', issuesFromZodError(parsed.error))
  const data = parsed.data

  await assertCategoryInStore(deps, storeId, data.categoryId)

  const now = deps.clock.nowIso()
  return deps.catalog.createProduct({
    id: newId(),
    storeId,
    categoryId: data.categoryId,
    name: data.name,
    displayName: data.name_display ?? null,
    legalName: data.name_legal ?? null,
    price: data.price,
    originalPrice: data.originalPrice ?? null,
    unit: resolveUnit(data.is_variable_weight, data.unit),
    imageUrl: data.imageUrl,
    inStock: data.inStock ?? true,
    isVariableWeight: data.is_variable_weight,
    badge: data.badge ?? null,
    currency: CATALOG_CURRENCY,
    description: data.description ?? null,
    nutritionalInfo: data.nutritionalInfo ?? null,
    availability: data.availability ?? null,
    active: data.active ?? true,
    archivedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }, auditFor(actor))
}

/** `undefined` conserva el valor actual; `null` lo borra. */
const patched = <T>(next: T | null | undefined, current: T | null): T | null => (next === undefined ? current : next)

/**
 * Edición parcial por el owner. Las reglas de precio/unidad se validan sobre el producto ya
 * fusionado y el UPDATE se condiciona a la versión leída: una edición concurrente produce
 * 409 en vez de mezclar estados. Archivar conserva la fila y su ID.
 */
export const updateProduct = async (
  deps: ManageProductsDeps,
  actor: StoreActor,
  id: string,
  input: unknown,
): Promise<CatalogProduct> => {
  const storeId = ownedStoreOf(actor)
  const parsed = updateProductRequestSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Invalid product', issuesFromZodError(parsed.error))
  const patch = parsed.data

  const current = await deps.catalog.findProduct(storeId, id)
  if (!current) throw new NotFoundError('Product', id)

  const isVariableWeight = patch.is_variable_weight ?? current.isVariableWeight
  const unit = isVariableWeight ? (patch.unit ?? VARIABLE_WEIGHT_UNIT) : (patch.unit ?? current.unit)
  const price = patch.price ?? current.price
  const originalPrice = patched(patch.originalPrice, current.originalPrice)

  const issues = productRuleIssues({ price, originalPrice, unit, is_variable_weight: isVariableWeight })
  if (issues.length > 0) throw new ValidationError('Invalid product', issues)

  const categoryId = patch.categoryId ?? current.categoryId
  if (categoryId !== current.categoryId) await assertCategoryInStore(deps, storeId, categoryId)

  const now = deps.clock.nowIso()
  const archivedAt = patch.archived === undefined ? current.archivedAt : patch.archived ? (current.archivedAt ?? now) : null

  const updated = await deps.catalog.updateProduct(
    {
      ...current,
      categoryId,
      name: patch.name ?? current.name,
      displayName: patched(patch.name_display, current.displayName),
      legalName: patched(patch.name_legal, current.legalName),
      price,
      originalPrice,
      unit,
      imageUrl: patch.imageUrl ?? current.imageUrl,
      inStock: patch.inStock ?? current.inStock,
      isVariableWeight,
      badge: patched(patch.badge, current.badge),
      description: patched(patch.description, current.description),
      nutritionalInfo: patched(patch.nutritionalInfo, current.nutritionalInfo),
      availability: patched(patch.availability, current.availability),
      active: patch.active ?? current.active,
      archivedAt,
      version: current.version + 1,
      updatedAt: now,
    },
    current.version,
    auditFor(actor, Object.keys(patch) as AuditMetadata['fields']),
  )
  if (!updated) throw new CatalogConflictError('CATALOG_CONCURRENT_UPDATE')
  return updated
}
