import { useQuery } from '@tanstack/react-query'
import { mockProducts, mockCategories, mockFeaturedProducts } from '@/features/catalog/mockData'

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => mockProducts,
    staleTime: 1000 * 60 * 5,
  })
}

export function useFeaturedProducts() {
  return useQuery({
    queryKey: ['products', 'featured'],
    queryFn: async () => mockFeaturedProducts,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => mockCategories,
    staleTime: 1000 * 60 * 10,
  })
}
