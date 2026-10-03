import type { VercelResponse } from '@vercel/node'
import {
  toPublicCatalogResponse,
  toProductDto,
  toStaffCatalogResponse,
  toStaffProductDto,
  toCategoryDto,
} from '../maui-back/src/domain/catalog/catalogMappers.js'
import { DEFAULT_STORE_ID } from '../maui-back/src/domain/orders/Order.js'
import { getRepositories } from '../maui-back/src/infra/factory.js'
import { getAuthRuntime } from '../maui-back/src/infra/auth/factory.js'
import { ownedStoreOf } from '../maui-back/src/domain/store/storeAccess.js'
import { uploadProductImage } from '../maui-back/src/usecases/catalog/uploadProductImage.js'
import { systemClock } from '../maui-back/src/shared/clock.js'
import { createCategory, deleteCategory, updateCategory } from '../maui-back/src/usecases/catalog/manageCategories.js'
import { createProduct, updateProduct } from '../maui-back/src/usecases/catalog/manageProducts.js'
import { getPublicCatalog, getPublicProduct, getStaffCatalog } from '../maui-back/src/usecases/catalog/readCatalog.js'
import { readJsonBody } from './_lib/auth.js'
import { MAX_CATALOG_BODY_BYTES, createOperationHandler, routeIdFrom } from './_lib/operations.js'
import { jsonResponse, ok } from './_lib/response.js'
import { imageVersionFrom, readProductImage } from './_lib/productImage.js'

/** Solo DTOs públicos exitosos: revalidar en red y permitir la copia offline acotada de la PWA. */
const okPublicCatalog = <T>(res: VercelResponse, body: T): void => {
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Vary', 'Origin')
  ok(res, body)
}

/**
 * Catálogo por tienda (T-07), una sola Function:
 *
 * | Ruta                              | Método | Acceso                              |
 * |-----------------------------------|--------|-------------------------------------|
 * | /api/catalog                      | GET    | público: activos y no archivados    |
 * | /api/catalog/products/:id         | GET    | público (oculto/archivado = 404)    |
 * | /api/catalog/staff                | GET    | owner/operator de su tienda         |
 * | /api/catalog/products             | POST   | owner                               |
 * | /api/catalog/products/:id         | PATCH  | owner (incluye agotado/activo/archivo) |
 * | /api/catalog/categories           | POST   | owner                               |
 * | /api/catalog/categories/:id       | PATCH, DELETE | owner                        |
 *
 * La tienda pública la fija el servidor; la de personal sale de la cuenta de la sesión.
 */
export default createOperationHandler(
  {
    image: {
      POST: async ({ req, res, sessionActor }) => {
        const actor = await sessionActor({ mutation: true })
        ownedStoreOf(actor)
        const id = routeIdFrom(req)
        const version = imageVersionFrom(req)
        // Un fallo del decoder nativo queda limitado a upload, sin afectar lecturas de catálogo.
        const { SharpProductImageProcessor } = await import('../maui-back/src/infra/storage/SharpProductImageProcessor.js')
        const { loadProductImageStorageConfig, VercelProductImageStorage } = await import('../maui-back/src/infra/storage/VercelProductImageStorage.js')
        const { catalog } = await getRepositories()
        const { deps } = await getAuthRuntime()
        const storage = new VercelProductImageStorage(loadProductImageStorageConfig(process.env))
        const product = await uploadProductImage({
          catalog, attempts: deps.repository, keys: deps.keys, clock: systemClock,
          processor: new SharpProductImageProcessor(), storage,
        }, actor, id, version, () => readProductImage(req))
        ok(res, toStaffProductDto(product))
      },
    },
    catalog: {
      GET: async ({ res }) => {
        const { catalog } = await getRepositories()
        okPublicCatalog(res, toPublicCatalogResponse(await getPublicCatalog({ catalog }, DEFAULT_STORE_ID)))
      },
    },
    product: {
      GET: async ({ req, res }) => {
        const id = routeIdFrom(req)
        const { catalog } = await getRepositories()
        okPublicCatalog(res, toProductDto(await getPublicProduct({ catalog }, DEFAULT_STORE_ID, id)))
      },
      PATCH: async ({ req, res, sessionActor }) => {
        const actor = await sessionActor({ mutation: true })
        const id = routeIdFrom(req)
        const body = readJsonBody(req, MAX_CATALOG_BODY_BYTES)
        const { catalog } = await getRepositories()
        ok(res, toStaffProductDto(await updateProduct({ catalog, clock: systemClock }, actor, id, body)))
      },
    },
    staff: {
      GET: async ({ res, sessionActor }) => {
        const actor = await sessionActor({ mutation: false })
        const { catalog } = await getRepositories()
        ok(res, toStaffCatalogResponse(await getStaffCatalog({ catalog }, actor)))
      },
    },
    products: {
      POST: async ({ req, res, sessionActor }) => {
        const actor = await sessionActor({ mutation: true })
        const body = readJsonBody(req, MAX_CATALOG_BODY_BYTES)
        const { catalog } = await getRepositories()
        ok(res, toStaffProductDto(await createProduct({ catalog, clock: systemClock }, actor, body)), 201)
      },
    },
    categories: {
      POST: async ({ req, res, sessionActor }) => {
        const actor = await sessionActor({ mutation: true })
        const body = readJsonBody(req, MAX_CATALOG_BODY_BYTES)
        const { catalog } = await getRepositories()
        ok(res, toCategoryDto(await createCategory({ catalog, clock: systemClock }, actor, body)), 201)
      },
    },
    category: {
      PATCH: async ({ req, res, sessionActor }) => {
        const actor = await sessionActor({ mutation: true })
        const id = routeIdFrom(req)
        const body = readJsonBody(req, MAX_CATALOG_BODY_BYTES)
        const { catalog } = await getRepositories()
        ok(res, toCategoryDto(await updateCategory({ catalog, clock: systemClock }, actor, id, body)))
      },
      DELETE: async ({ req, res, sessionActor }) => {
        const actor = await sessionActor({ mutation: true })
        const id = routeIdFrom(req)
        const { catalog } = await getRepositories()
        await deleteCategory({ catalog, clock: systemClock }, actor, id)
        jsonResponse(res, null, 204, true)
      },
    },
  },
  'catalog',
)
