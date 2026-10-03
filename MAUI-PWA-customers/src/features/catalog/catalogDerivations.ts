// Derivaciones puras del catálogo que la PWA calcula sobre lo que entrega el servidor
// (el contrato no tiene «destacados», búsqueda ni verticales de negocio). Sin red ni estado.

import type { BusinessCategoryGroup, Product } from '@/types'

/** Máximo de productos del carrusel «Ofertas del día». */
export const FEATURED_LIMIT = 4

/** Destacados: los primeros disponibles en el ORDEN que entregó el servidor (sin reordenar). */
export function deriveFeaturedProducts(products: readonly Product[], limit: number = FEATURED_LIMIT): Product[] {
  return products.filter((product) => product.inStock).slice(0, limit)
}

/** Minúsculas, sin tildes y sin espacios sobrantes: «Leche» encuentra «leche» y «lácteos». */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Búsqueda sobre los nombres (corto, de pantalla y legal); mantiene el orden del catálogo. */
export function searchProducts(products: readonly Product[], query: string): Product[] {
  const needle = normalizeSearchText(query)
  if (!needle) return []
  return products.filter((product) =>
    [product.name, product.name_display, product.name_legal]
      .filter(Boolean)
      .some((text) => normalizeSearchText(String(text)).includes(needle)),
  )
}

/**
 * En modo real se omiten las verticales futuras (`comingSoon`): no existen en el servidor ni en
 * esta entrega. Un grupo sin ítems activos desaparece por completo.
 */
export function activeBusinessGroups(groups: readonly BusinessCategoryGroup[]): BusinessCategoryGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.comingSoon) }))
    .filter((group) => group.items.length > 0)
}
