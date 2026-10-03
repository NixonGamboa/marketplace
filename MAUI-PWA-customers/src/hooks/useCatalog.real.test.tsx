/**
 * Hooks de catálogo en modo real con el servicio simulado (no es evidencia de cierre real):
 * una sola consulta alimenta todo, los destacados se derivan y los fallos no se vuelven «vacío».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ApiError } from '@/services/http/apiError'

const getCatalog = vi.hoisted(() => vi.fn())
vi.mock('@/services/realCatalogService', () => ({ realCatalogService: { getCatalog, getStore: vi.fn() } }))

import { useBusinessCategoryGroups, useCategories, useFeaturedProducts, useProducts } from './useCatalog'

const product = (id: string, inStock = true) => ({
  id, name: id, price: 1000, unit: '1 u', imageUrl: '/x.png', categoryId: 'cat-a', inStock, is_variable_weight: false, currency: 'COP' as const,
})
const catalog = (products = [product('a'), product('b', false), product('c'), product('d'), product('e'), product('f')]) => ({
  categories: [{ id: 'cat-b', name: 'B', slug: 'b', order: 2 }, { id: 'cat-a', name: 'A', slug: 'a', order: 1 }],
  products,
})

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('hooks de catálogo (modo real, servicio simulado)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('productos, categorías y destacados salen de UNA sola consulta, en el orden del servidor', async () => {
    getCatalog.mockResolvedValue(catalog())
    const { result } = renderHook(() => ({ products: useProducts(), categories: useCategories(), featured: useFeaturedProducts() }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.featured.data).toBeDefined())
    expect(getCatalog).toHaveBeenCalledTimes(1)
    expect(result.current.products.data?.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(result.current.categories.data?.map((c) => c.id)).toEqual(['cat-b', 'cat-a'])
    expect(result.current.featured.data?.map((p) => p.id)).toEqual(['a', 'c', 'd', 'e'])
  })

  it('un fallo del servidor es error (con reintento), no un catálogo vacío', async () => {
    getCatalog.mockRejectedValue(new ApiError({ kind: 'unavailable', status: 503, message: 'x' }))
    const { result } = renderHook(() => useProducts(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('un refetch refleja cambios del backend (disponibilidad) en los destacados', async () => {
    getCatalog.mockResolvedValueOnce(catalog([product('a'), product('b')])).mockResolvedValueOnce(catalog([product('a', false), product('b')]))
    const { result } = renderHook(() => useFeaturedProducts(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.data?.map((p) => p.id)).toEqual(['a', 'b']))
    await result.current.refetch()
    await waitFor(() => expect(result.current.data?.map((p) => p.id)).toEqual(['b']))
  })

  it('las verticales futuras no aparecen en modo real', async () => {
    const { result } = renderHook(() => useBusinessCategoryGroups(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    const groups = result.current.data ?? []
    expect(groups.flatMap((g) => g.items).every((item) => !item.comingSoon)).toBe(true)
    expect(groups.map((g) => g.id)).not.toContain('servicios')
    expect(groups.map((g) => g.id)).not.toContain('comunidad')
  })
})
