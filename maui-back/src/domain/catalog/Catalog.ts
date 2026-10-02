import type { NutritionalInfoDto } from '../../../../shared/contracts/index.js'

/**
 * Modelo interno del catálogo (persistencia/casos de uso). Incluye `storeId` y `version`,
 * que nunca salen en los DTO. Los campos opcionales del contrato son `null` aquí.
 */
export interface CatalogCategory {
  id: string
  storeId: string
  name: string
  icon: string | null
  slug: string | null
  illustrationUrl: string | null
  order: number | null
  version: number
  /** ISO UTC. */
  createdAt: string
  updatedAt: string
}

/**
 * Producto de una tienda. Tres estados independientes:
 *  - `active`: publicado; `false` lo oculta al público sin archivarlo.
 *  - `inStock`: `false` = agotado; sigue visible con su badge.
 *  - `archivedAt`: retirado del catálogo. Nunca se borra la fila: los pedidos
 *    históricos conservan el ID y su snapshot de nombre/precio.
 */
export interface CatalogProduct {
  id: string
  storeId: string
  categoryId: string
  name: string
  displayName: string | null
  legalName: string | null
  /** COP entero; precio por kg si `isVariableWeight`. */
  price: number
  originalPrice: number | null
  unit: string
  imageUrl: string
  inStock: boolean
  isVariableWeight: boolean
  badge: string | null
  currency: 'COP'
  description: string | null
  nutritionalInfo: NutritionalInfoDto | null
  availability: string | null
  active: boolean
  archivedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export const isPubliclyVisible = (product: Pick<CatalogProduct, 'active' | 'archivedAt'>): boolean =>
  product.active && product.archivedAt === null
