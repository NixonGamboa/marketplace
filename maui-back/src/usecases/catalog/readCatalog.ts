import { isPubliclyVisible, type CatalogCategory, type CatalogProduct } from '../../domain/catalog/Catalog.js'
import type { CatalogRepository, ProductVisibility } from '../../domain/catalog/CatalogRepository.js'
import { staffStoreOf, type StoreActor } from '../../domain/store/storeAccess.js'
import { NotFoundError } from '../../shared/errors.js'

export interface CatalogReadDeps {
  catalog: Pick<CatalogRepository, 'listCategories' | 'listProducts' | 'findProduct'>
}

export interface CatalogSnapshot {
  categories: CatalogCategory[]
  products: CatalogProduct[]
}

const readCatalog = async (deps: CatalogReadDeps, storeId: string, visibility: ProductVisibility): Promise<CatalogSnapshot> => {
  const [categories, products] = await Promise.all([
    deps.catalog.listCategories(storeId),
    deps.catalog.listProducts(storeId, visibility),
  ])
  return { categories, products }
}

/** Catálogo público de la tienda fijada por el servidor: solo productos activos y no archivados. */
export const getPublicCatalog = (deps: CatalogReadDeps, storeId: string): Promise<CatalogSnapshot> =>
  readCatalog(deps, storeId, 'public')

/** Vista de personal (owner/operator): todo el catálogo de SU tienda, incluidos ocultos y archivados. */
export const getStaffCatalog = async (deps: CatalogReadDeps, actor: StoreActor): Promise<CatalogSnapshot> =>
  readCatalog(deps, staffStoreOf(actor), 'all')

/** Detalle público. Oculto, archivado, de otra tienda o inexistente: el mismo 404. */
export const getPublicProduct = async (deps: CatalogReadDeps, storeId: string, id: string): Promise<CatalogProduct> => {
  const product = await deps.catalog.findProduct(storeId, id)
  if (!product || !isPubliclyVisible(product)) throw new NotFoundError('Product', id)
  return product
}
