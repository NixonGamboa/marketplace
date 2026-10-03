import { skipToken, useQuery } from '@tanstack/react-query'
import { isDemoMode } from '@/config/mode'
import { mockProducts, mockCategories, mockBusinessCategoryGroups } from '@/features/catalog/mockData'
import { activeBusinessGroups, deriveFeaturedProducts } from '@/features/catalog/catalogDerivations'
import { realCatalogService } from '@/services/realCatalogService'
import type { Category, Product } from '@/types'

export interface CatalogSnapshot {
  products: Product[]
  categories: Category[]
  /** Instante en que el service worker guardó la copia mostrada; `null` si llegó fresca del servidor. */
  cachedAt: number | null
}

/** Una sola consulta alimenta productos, categorías y destacados: todos ven el mismo catálogo. */
async function loadCatalog(signal: AbortSignal): Promise<CatalogSnapshot> {
  if (isDemoMode()) return { products: mockProducts, categories: mockCategories, cachedAt: null }
  let cachedAt: number | null = null
  const catalog = await realCatalogService.getCatalog({ signal, onServedFromCache: (savedAt) => { cachedAt = savedAt } })
  return { products: catalog.products, categories: catalog.categories, cachedAt }
}

export const catalogQueryKey = () => ['catalog', isDemoMode() ? 'demo' : 'real'] as const

function useCatalogSnapshot<T>(select: (snapshot: CatalogSnapshot) => T) {
  return useQuery({
    queryKey: catalogQueryKey(),
    queryFn: ({ signal }) => loadCatalog(signal),
    staleTime: 1000 * 60 * 5,
    // Sin red igual se intenta: el service worker puede responder con la última copia pública guardada.
    networkMode: 'offlineFirst',
    select,
  })
}

const selectProducts = (snapshot: CatalogSnapshot) => snapshot.products
const selectCategories = (snapshot: CatalogSnapshot) => snapshot.categories
const selectCachedAt = (snapshot: CatalogSnapshot) => snapshot.cachedAt
const selectFeatured = (snapshot: CatalogSnapshot) => deriveFeaturedProducts(snapshot.products)

export function useProducts() {
  return useCatalogSnapshot(selectProducts)
}

/** Hasta 4 productos disponibles, en el orden del servidor. */
export function useFeaturedProducts() {
  return useCatalogSnapshot(selectFeatured)
}

export function useCategories() {
  return useCatalogSnapshot(selectCategories)
}

/**
 * Instante de guardado de la copia que se está mostrando (`null`: viene del servidor o aún no hay
 * catálogo). Solo observa la consulta: no dispara la carga en pantallas que no usan el catálogo.
 */
export function useCatalogCachedAt(): number | null {
  return useQuery({ queryKey: catalogQueryKey(), queryFn: skipToken, select: selectCachedAt }).data ?? null
}

export function useBusinessCategoryGroups() {
  return useQuery({
    queryKey: ['business-category-groups', isDemoMode() ? 'demo' : 'real'],
    queryFn: async () => (isDemoMode() ? mockBusinessCategoryGroups : activeBusinessGroups(mockBusinessCategoryGroups)),
    staleTime: 1000 * 60 * 60,
  })
}
