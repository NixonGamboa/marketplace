// Catálogo y tienda públicos reales. El servidor fija la tienda; la lectura no requiere sesión.
// El catálogo llega completo en una sola respuesta (sin cursor): no hay truncado posible.
// Sin concepto de «destacados» ni de grupos de negocio en el contrato: esos datos no se inventan aquí.

import { productDtoSchema, publicCatalogResponseSchema, storeDtoSchema, type PublicCatalogResponse, type StoreDto } from '@shared/contracts'
import type { Product } from '@/types/catalog'
import { apiClient, type ApiClient } from './http/apiClient'
import { servedFromCacheAt } from '@/pwa/cachePolicy'
import type { RequestOptions } from './realAuthService'

export interface CatalogRequestOptions extends RequestOptions {
  /** Se invoca con el instante del guardado cuando el service worker respondió con una copia suya (sin red). */
  onServedFromCache?: (cachedAt: number) => void
}

export interface RealCatalogService {
  /** Categorías y productos activos (agotados incluidos, con `inStock: false`). */
  getCatalog(options?: CatalogRequestOptions): Promise<PublicCatalogResponse>
  /** Producto activo; oculto, archivado o inexistente → ApiError `not_found`. */
  getProduct(id: string, options?: RequestOptions): Promise<Product>
  /** Configuración, reglas de entrega y disponibilidad calculada por el servidor. 404 si la tienda no está sembrada. */
  getStore(options?: RequestOptions): Promise<StoreDto>
}

const signalOf = (options?: RequestOptions) => (options?.signal ? { signal: options.signal } : {})

const cacheNoticeOf = (options?: CatalogRequestOptions) =>
  options?.onServedFromCache
    ? {
        onResponseHeaders: (headers: Headers) => {
          const cachedAt = servedFromCacheAt(headers)
          if (cachedAt !== null) options.onServedFromCache?.(cachedAt)
        },
      }
    : {}

export const createRealCatalogService = (client: ApiClient = apiClient): RealCatalogService => ({
  getCatalog: (options) => client.request({ path: '/catalog', schema: publicCatalogResponseSchema, ...signalOf(options), ...cacheNoticeOf(options) }),
  getProduct: (id, options) => client.request({ path: `/catalog/products/${encodeURIComponent(id)}`, schema: productDtoSchema, ...signalOf(options) }),
  getStore: (options) => client.request({ path: '/store', schema: storeDtoSchema, ...signalOf(options) }),
})

export const realCatalogService: RealCatalogService = createRealCatalogService()
