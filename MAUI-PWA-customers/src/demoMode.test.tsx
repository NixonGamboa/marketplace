/**
 * El demo se conserva intacto con `VITE_DEMO_MODE=true` (mecanismo existente): sesión simulada,
 * catálogo y reglas locales, sin llamadas a la API ni guarda de sesión. Se reimportan los módulos
 * para que la elección de modo (que ocurre al cargarlos) se haga con el entorno de demo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

describe('modo demo', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_DEMO_MODE', 'true')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('el store de auth conserva el usuario demo, el ingreso simulado y persiste el perfil', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { useAuthStore } = await import('@/stores/authStore')
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, sessionStatus: 'ready', user: { id: 'demo-user-001' } })
    vi.useFakeTimers()
    const login = useAuthStore.getState().login('+57 300 111 2233', 'Pepa')
    await vi.advanceTimersByTimeAsync(800)
    await login
    vi.useRealTimers()
    expect(useAuthStore.getState().user).toMatchObject({ id: 'wa-573001112233', name: 'Pepa' })
    expect(window.localStorage.getItem('maui-auth-v1')).toContain('wa-573001112233')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('el catálogo y los destacados salen de los datos locales, sin red', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { useFeaturedProducts, useProducts } = await import('@/hooks/useCatalog')
    const { result } = renderHook(() => ({ products: useProducts(), featured: useFeaturedProducts() }), { wrapper })
    await waitFor(() => expect(result.current.featured.data).toBeDefined())
    expect(result.current.products.data?.length).toBeGreaterThan(0)
    expect(result.current.featured.data?.length).toBeLessThanOrEqual(4)
    expect(result.current.featured.data?.every((product) => product.inStock)).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('las verticales futuras siguen visibles en el demo', async () => {
    const { useBusinessCategoryGroups } = await import('@/hooks/useCatalog')
    const { result } = renderHook(() => useBusinessCategoryGroups(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.some((group) => group.items.some((item) => item.comingSoon))).toBe(true)
  })

  it('las reglas del checkout son las constantes locales y RequireSession no interpone nada', async () => {
    const { DEMO_CHECKOUT_RULES } = await import('@/features/checkout/storeRules')
    expect(DEMO_CHECKOUT_RULES).toMatchObject({ status: 'ready', acceptsPickup: true, acceptsDelivery: true, shipping: { cost: 3000, freeThreshold: 30000 } })
    const { RequireSession } = await import('@/features/auth/RequireSession')
    const { useAuthStore } = await import('@/stores/authStore')
    useAuthStore.setState({ user: null, isAuthenticated: false })
    render(<MemoryRouter><RequireSession><p>privado demo</p></RequireSession></MemoryRouter>)
    expect(screen.getByText('privado demo')).toBeInTheDocument()
  })

  it('el contacto del negocio sigue siendo el configurado localmente por el admin demo', async () => {
    window.localStorage.setItem('maui-admin-merchant', JSON.stringify({ mch_lechemiel: { whatsapp: '3015550101' } }))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { useStoreContactPhone } = await import('@/shared/hooks/useStoreContactPhone')
    const { result } = renderHook(() => useStoreContactPhone(), { wrapper })
    expect(result.current).toBe('573015550101')
    expect(fetchSpy).not.toHaveBeenCalled()
    window.localStorage.clear()
  })
})
