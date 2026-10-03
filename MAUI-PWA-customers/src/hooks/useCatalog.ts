import { useQuery } from '@tanstack/react-query'
import { isDemoMode } from '@/config/mode'
import { mockProducts, mockCategories, mockBusinessCategoryGroups } from '@/features/catalog/mockData'
import { activeBusinessGroups, deriveFeaturedProducts } from '@/features/catalog/catalogDerivations'
import { realCatalogService } from '@/services/realCatalogService'
import type { Category, Product } from '@/types'

interface CatalogSnapshot {
  products: Product[]
  categories: Category[]
}

/** Una sola consulta alimenta productos, categorías y destacados: todos ven el mismo catálogo. */
async function loadCatalog(signal: AbortSignal): Promise<CatalogSnapshot> {
  if (isDemoMode()) return { products: mockProducts, categories: mockCategories }
  const catalog = await realCatalogService.getCatalog({ signal })
  return { products: catalog.products, categories: catalog.categories }
}

function useCatalogSnapshot<T>(select: (snapshot: CatalogSnapshot) => T) {
  return useQuery({
    queryKey: ['catalog', isDemoMode() ? 'demo' : 'real'],
    queryFn: ({ signal }) => loadCatalog(signal),
    staleTime: 1000 * 60 * 5,
    select,
  })
}

const selectProducts = (snapshot: CatalogSnapshot) => snapshot.products
const selectCategories = (snapshot: CatalogSnapshot) => snapshot.categories
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

export function useBusinessCategoryGroups() {
  return useQuery({
    queryKey: ['business-category-groups', isDemoMode() ? 'demo' : 'real'],
    queryFn: async () => (isDemoMode() ? mockBusinessCategoryGroups : activeBusinessGroups(mockBusinessCategoryGroups)),
    staleTime: 1000 * 60 * 60,
  })
}
