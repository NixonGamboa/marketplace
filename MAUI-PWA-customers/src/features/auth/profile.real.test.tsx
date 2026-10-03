/**
 * Perfil real con auth simulado (no es evidencia de cierre real): identidad del servidor de solo
 * lectura, cierre de sesión confirmado por el servidor y contacto del negocio desde la tienda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError } from '@/services/http/apiError'

const mocks = vi.hoisted(() => ({ logout: vi.fn(), getStore: vi.fn() }))
vi.mock('@/services/realAuthService', () => ({ realAuthService: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: mocks.logout } }))
vi.mock('@/services/realCatalogService', () => ({ realCatalogService: { getStore: mocks.getStore, getCatalog: vi.fn() } }))

import { useAuthStore } from '@/stores/authStore'
import ProfilePage from './pages/ProfilePage'

const renderProfile = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/perfil']}>
      <Routes>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/" element={<p>inicio</p>} />
        <Route path="/auth" element={<p>ingreso</p>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getStore.mockResolvedValue({ contactPhone: '573105550101' })
  useAuthStore.setState({ user: { id: 'usr-1', name: 'Ana Gómez', phone: '573105550101', isAuthenticated: true }, isAuthenticated: true, sessionStatus: 'ready' })
})
afterEach(() => { cleanup(); useAuthStore.setState({ user: null, isAuthenticated: false }) })

describe('ProfilePage (modo real)', () => {
  it('muestra la identidad del servidor sin editar nombre ni dirección local', () => {
    renderProfile()
    expect(screen.getByRole('heading', { name: 'Ana Gómez' })).toBeInTheDocument()
    expect(screen.getByText('+57 310 555 0101')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar perfil' })).toBeNull()
    expect(screen.queryByText('Dirección de entrega')).toBeNull()
  })

  it('el enlace de ayuda usa el WhatsApp del negocio que entrega el servidor', async () => {
    renderProfile()
    const link = await screen.findByRole('link', { name: /Ayuda por WhatsApp/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/573105550101'))
  })

  it('cerrar sesión pasa por el servidor y vuelve al inicio', async () => {
    mocks.logout.mockResolvedValue(undefined)
    renderProfile()
    fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }))
    expect(await screen.findByText('inicio')).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('si el servidor no confirma el cierre, la sesión sigue y se avisa', async () => {
    mocks.logout.mockRejectedValue(new ApiError({ kind: 'unavailable', status: 503, message: 'x' }))
    renderProfile()
    fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }))
    expect(await screen.findByText(/No pudimos cerrar tu sesión/)).toBeInTheDocument()
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
  })
})
