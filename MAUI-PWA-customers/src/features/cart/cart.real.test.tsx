/**
 * Carrito real con catálogo simulado (no es evidencia de cierre real): precios vigentes del
 * servidor, productos que ya no se pueden pedir y bloqueo del avance. El servidor revalida.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { CartItem } from '@/types'
import { useCartStore } from '@/stores/cartStore'
import { ApiError } from '@/services/http/apiError'

const getCatalog = vi.hoisted(() => vi.fn())
vi.mock('@/services/realCatalogService', () => ({ realCatalogService: { getCatalog, getStore: vi.fn() } }))

import CartPage from './pages/CartPage'

const product = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, name: `Producto ${id}`, price: 1000, unit: '1 u', imageUrl: '/x.png', categoryId: 'cat', inStock: true, is_variable_weight: false, currency: 'COP' as const, ...overrides,
})
const line = (productId: string, overrides: Partial<CartItem> = {}): CartItem => ({
  productId, name: `Producto ${productId}`, imageUrl: '/x.png', price: 1000, price_at_moment: 1000, unit: '1 u', quantity: 2, is_variable_weight: false, ...overrides,
})

const renderCart = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><CartPage /></MemoryRouter>
  </QueryClientProvider>,
)

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { cleanup(); useCartStore.getState().clearCart() })

describe('cartStore.syncWithCatalog', () => {
  it('actualiza precio, nombre y unidad al vigente y recalcula el total', () => {
    act(() => useCartStore.setState({ items: [line('a')], total: 2000 }))
    act(() => useCartStore.getState().syncWithCatalog([product('a', { price: 1500, name: 'Nuevo nombre', unit: '2 u' }) as never]))
    expect(useCartStore.getState().items[0]).toMatchObject({ price: 1500, price_at_moment: 1500, name: 'Nuevo nombre', unit: '2 u', quantity: 2 })
    expect(useCartStore.getState().total).toBe(3000)
  })

  it('no escribe si nada cambió y no toca productos ausentes ni de otra forma de venta', () => {
    act(() => useCartStore.setState({ items: [line('a'), line('b'), line('c', { is_variable_weight: true, kilos: 1 })], total: 5000 }))
    const before = useCartStore.getState().items
    act(() => useCartStore.getState().syncWithCatalog([product('a'), product('c', { price: 9999 }) as never]))
    expect(useCartStore.getState().items).toBe(before)
  })
})

describe('CartPage (modo real)', () => {
  it('concilia el precio con el servidor al abrir el carrito', async () => {
    getCatalog.mockResolvedValue({ categories: [], products: [product('a', { price: 1200 })] })
    act(() => useCartStore.setState({ items: [line('a')], total: 2000 }))
    renderCart()
    await waitFor(() => expect(useCartStore.getState().items[0]?.price_at_moment).toBe(1200))
    expect(screen.getByRole('button', { name: /Pedir mi Mercado/ })).toBeEnabled()
  })

  it('avisa de lo agotado o retirado y bloquea el avance hasta quitarlo', async () => {
    getCatalog.mockResolvedValue({ categories: [], products: [product('a', { inStock: false }), product('c')] })
    act(() => useCartStore.setState({ items: [line('a'), line('b'), line('c')], total: 6000 }))
    renderCart()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Ya no podemos entregar estos productos')
    expect(alert).toHaveTextContent('Producto a')
    expect(alert).toHaveTextContent('Producto b')
    expect(screen.getByRole('button', { name: /Pedir mi Mercado/ })).toBeDisabled()

    act(() => { useCartStore.getState().removeItem('a'); useCartStore.getState().removeItem('b') })
    await waitFor(() => expect(screen.getByRole('button', { name: /Pedir mi Mercado/ })).toBeEnabled())
  })

  it('si no se puede comprobar la disponibilidad lo dice y no deja avanzar a ciegas', async () => {
    getCatalog.mockRejectedValue(new ApiError({ kind: 'unavailable', status: 503, message: 'x' }))
    act(() => useCartStore.setState({ items: [line('a')], total: 2000 }))
    renderCart()
    expect(await screen.findByText(/No pudimos comprobar la disponibilidad/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pedir mi Mercado/ })).toBeDisabled()
    getCatalog.mockResolvedValue({ categories: [], products: [product('a')] })
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Pedir mi Mercado/ })).toBeEnabled())
  })
})
