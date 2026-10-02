// Catálogo y tienda públicos reales. El servidor fija la tienda; la lectura no requiere sesión.
// El catálogo llega completo en una sola respuesta (sin cursor): no hay truncado posible.
// Sin concepto de «destacados» ni de grupos de negocio en el contrato: esos datos no se inventan aquí.

import { productDtoSchema, publicCatalogResponseSchema, storeDtoSchema, type PublicCatalogResponse, type StoreDto } from '@shared/contracts'
import type { Product } from '@/types/catalog'
import { apiClient, type ApiClient } from './http/apiClient'
import type { RequestOptions } from './realAuthService'

export interface RealCatalogService {
  /** Categorías y productos activos (agotados incluidos, con `inStock: false`). */
  getCatalog(options?: RequestOptions): Promise<PublicCatalogResponse>
  /** Producto activo; oculto, archivado o inexistente → ApiError `not_found`. */
  getProduct(id: string, options?: RequestOptions): Promise<Product>
  /** Configuración, reglas de entrega y disponibilidad calculada por el servidor. 404 si la tienda no está sembrada. */
  getStore(options?: RequestOptions): Promise<StoreDto>
}

const signalOf = (options?: RequestOptions) => (options?.signal ? { signal: options.signal } : {})

export const createRealCatalogService = (client: ApiClient = apiClient): RealCatalogService => ({
  getCatalog: (options) => client.request({ path: '/catalog', schema: publicCatalogResponseSchema, ...signalOf(options) }),
  getProduct: (id, options) => client.request({ path: `/catalog/products/${encodeURIComponent(id)}`, schema: productDtoSchema, ...signalOf(options) }),
  getStore: (options) => client.request({ path: '/store', schema: storeDtoSchema, ...signalOf(options) }),
})

export const realCatalogService: RealCatalogService = createRealCatalogService()
