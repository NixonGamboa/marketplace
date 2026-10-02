import {
  createCategoryRequestSchema,
  issuesFromZodError,
  updateCategoryRequestSchema,
} from '../../../../shared/contracts/index.js'
import type { CatalogCategory } from '../../domain/catalog/Catalog.js'
import type { CatalogRepository } from '../../domain/catalog/CatalogRepository.js'
import { CatalogConflictError } from '../../domain/catalog/errors.js'
import { ownedStoreOf, type StoreActor } from '../../domain/store/storeAccess.js'
import type { Clock } from '../../shared/clock.js'
import { NotFoundError, ValidationError } from '../../shared/errors.js'
import { newId } from '../../shared/ids.js'

export interface ManageCategoriesDeps {
  catalog: Pick<CatalogRepository, 'findCategory' | 'createCategory' | 'updateCategory' | 'deleteCategory'>
  clock: Clock
}

/** Alta de categoría por el owner en SU tienda; ID asignado por el servidor. */
export const createCategory = async (
  deps: ManageCategoriesDeps,
  actor: StoreActor,
  input: unknown,
): Promise<CatalogCategory> => {
  const storeId = ownedStoreOf(actor)
  const parsed = createCategoryRequestSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Invalid category', issuesFromZodError(parsed.error))
  const data = parsed.data

  const now = deps.clock.nowIso()
  return deps.catalog.createCategory({
    id: newId(),
    storeId,
    name: data.name,
    icon: data.icon ?? null,
    slug: data.slug ?? null,
    illustrationUrl: data.illustrationUrl ?? null,
    order: data.order ?? null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  })
}

const patched = <T>(next: T | null | undefined, current: T | null): T | null => (next === undefined ? current : next)

/** Edición parcial por el owner, condicionada a la versión leída. */
export const updateCategory = async (
  deps: ManageCategoriesDeps,
  actor: StoreActor,
  id: string,
  input: unknown,
): Promise<CatalogCategory> => {
  const storeId = ownedStoreOf(actor)
  const parsed = updateCategoryRequestSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Invalid category', issuesFromZodError(parsed.error))
  const patch = parsed.data

  const current = await deps.catalog.findCategory(storeId, id)
  if (!current) throw new NotFoundError('Category', id)

  const updated = await deps.catalog.updateCategory(
    {
      ...current,
      name: patch.name ?? current.name,
      icon: patched(patch.icon, current.icon),
      slug: patched(patch.slug, current.slug),
      illustrationUrl: patched(patch.illustrationUrl, current.illustrationUrl),
      order: patched(patch.order, current.order),
      version: current.version + 1,
      updatedAt: deps.clock.nowIso(),
    },
    current.version,
  )
  if (!updated) throw new CatalogConflictError('CATALOG_CONCURRENT_UPDATE')
  return updated
}

/**
 * Elimina una categoría vacía de SU tienda. Con productos (incluidos archivados) responde
 * `CATEGORY_IN_USE`; la comprobación es la FK en la misma sentencia DELETE, así que un
 * producto creado en paralelo no puede quedar huérfano.
 */
export const deleteCategory = async (deps: ManageCategoriesDeps, actor: StoreActor, id: string): Promise<void> => {
  const storeId = ownedStoreOf(actor)
  if (!(await deps.catalog.deleteCategory(storeId, id))) throw new NotFoundError('Category', id)
}
