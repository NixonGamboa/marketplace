import {
  categoryDtoSchema,
  createCategoryRequestSchema,
  createProductRequestSchema,
  staffCatalogResponseSchema,
  staffProductDtoSchema,
  updateCategoryRequestSchema,
  updateProductRequestSchema,
  type StaffCatalogResponse,
  type StaffProductDto,
} from '@shared/contracts'
import type { Category } from '@/types/catalog'
import { apiClient, type ApiClient } from './http/apiClient'
import { validateRequest } from './http/validateRequest'
import {
  categoryFromDto,
  createCategoryRequestFrom,
  createProductRequestFrom,
  matchesCatalogFilter,
  updateCategoryRequestFrom,
  updateProductRequestFrom,
} from './real/adapters'
import type { RequestOptions } from './realAuthRepository'
import type { CatalogRepository } from './mockCatalogRepository'

/** El repository real devuelve el DTO de personal: añade `version`, `active`, `archived` y fechas. */
export interface RealCatalogRepository extends CatalogRepository {
  /** Catálogo completo de la tienda de la sesión, con productos ocultos y archivados. */
  getStaffCatalog(options?: RequestOptions): Promise<StaffCatalogResponse>
  upsertProduct(...args: Parameters<CatalogRepository['upsertProduct']>): Promise<StaffProductDto>
  toggleStock(...args: Parameters<CatalogRepository['toggleStock']>): Promise<StaffProductDto>
}

const productPath = (id: string): string => `/catalog/products/${encodeURIComponent(id)}`
const categoryPath = (id: string): string => `/catalog/categories/${encodeURIComponent(id)}`

/**
 * El servidor asigna los IDs y deriva tienda y actor de la sesión (`by` no viaja).
 * Solo el owner muta; un operator recibe 403 explícito del servidor.
 */
export const createRealCatalogRepository = (client: ApiClient = apiClient): RealCatalogRepository => {
  const getStaffCatalog: RealCatalogRepository['getStaffCatalog'] = (options) =>
    client.request({ path: '/catalog/staff', schema: staffCatalogResponseSchema, ...(options?.signal ? { signal: options.signal } : {}) })

  const patchProduct = async (id: string, patch: unknown): Promise<StaffProductDto> =>
    client.request({
      method: 'PATCH',
      path: productPath(id),
      body: validateRequest(updateProductRequestSchema, patch),
      schema: staffProductDtoSchema,
    })

  return {
    getStaffCatalog,

    async listProducts(filter) {
      const { products } = await getStaffCatalog()
      return products.filter((product) => !product.archived && matchesCatalogFilter(product, filter))
    },

    async getProduct(id) {
      const { products } = await getStaffCatalog()
      const found = products.find((product) => product.id === id)
      return found && !found.archived ? found : null
    },

    /** Existe en la tienda → PATCH completo del formulario; no existe → alta (el servidor asigna el ID). */
    async upsertProduct(product) {
      const { products } = await getStaffCatalog()
      if (products.some((existing) => existing.id === product.id)) {
        return patchProduct(product.id, updateProductRequestFrom(product))
      }
      return client.request({
        method: 'POST',
        path: '/catalog/products',
        body: validateRequest(createProductRequestSchema, createProductRequestFrom(product)),
        schema: staffProductDtoSchema,
      })
    },

    /** No hay borrado físico: se archiva para conservar el histórico de pedidos. */
    async deleteProduct(id) {
      await patchProduct(id, { archived: true })
    },

    toggleStock(id, inStock) {
      return patchProduct(id, { inStock })
    },

    async listCategories() {
      return (await getStaffCatalog()).categories.map(categoryFromDto)
    },

    async upsertCategory(category: Category) {
      const { categories } = await getStaffCatalog()
      if (categories.some((existing) => existing.id === category.id)) {
        return client.request({
          method: 'PATCH',
          path: categoryPath(category.id),
          body: validateRequest(updateCategoryRequestSchema, updateCategoryRequestFrom(category)),
          schema: categoryDtoSchema,
        })
      }
      return client.request({
        method: 'POST',
        path: '/catalog/categories',
        body: validateRequest(createCategoryRequestSchema, createCategoryRequestFrom(category)),
        schema: categoryDtoSchema,
      })
    },

    /** 409 `CATEGORY_IN_USE` si aún tiene productos (incluidos archivados). */
    async deleteCategory(id) {
      await client.request({ method: 'DELETE', path: categoryPath(id) })
    },
  }
}

export const realCatalogRepository: RealCatalogRepository = createRealCatalogRepository()
