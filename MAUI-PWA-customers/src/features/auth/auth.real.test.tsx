/**
 * Sesión real de la PWA con el servicio de auth simulado (no es evidencia de cierre real):
 * identidad del servidor, ingreso/registro, expiración, aislamiento de datos privados entre cuentas
 * y ausencia de sesiones ficticias fuera del demo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ApiError } from '@/services/http/apiError'
import { notifySessionExpired } from '@/services/http/sessionExpiry'
import type { CustomerSession } from '@/services/real/adapters'

const auth = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }))
vi.mock('@/services/realAuthService', () => ({ realAuthService: auth }))

import { useAuthStore } from '@/stores/authStore'
import { useCheckoutStore } from '@/features/checkout/checkoutStore'
import { queryClient } from '@/shared/queryClient'
import { RequireSession } from './RequireSession'
import { SessionLifecycle } from './SessionLifecycle'
import RealAuthPage from './pages/RealAuthPage'

const session = (id = 'usr-1', expiresAt = '2999-01-01T00:00:00.000Z'): CustomerSession => ({
  user: { id, name: `Cliente ${id}`, phone: '573105550101', isAuthenticated: true },
  expiresAt,
})

const initial = useAuthStore.getState()
const resetStore = () => useAuthStore.setState({
  user: null, isAuthenticated: false, loading: false, sessionStatus: 'ready', sessionExpired: false, sessionExpiresAt: null,
}, false)

beforeEach(() => {
  vi.clearAllMocks()
  resetStore()
  queryClient.clear()
  useCheckoutStore.getState().reset()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

function Where() {
  const location = useLocation()
  return <p data-testid="where">{`${location.pathname}|${JSON.stringify(location.state)}`}</p>
}

const renderGuard = (initialPath = '/pedidos') => render(
  <MemoryRouter initialEntries={[initialPath]}>
    <Routes>
      <Route path="/auth" element={<Where />} />
      <Route path="/pedidos" element={<RequireSession><p>privado</p></RequireSession>} />
    </Routes>
  </MemoryRouter>,
)

describe('store de sesión (modo real)', () => {
  it('arranca sin usuario: no hay perfil ficticio ni persistido', () => {
    expect(initial.user).toBeNull()
    expect(initial.isAuthenticated).toBe(false)
    expect(initial.sessionStatus).toBe('restoring')
    expect(window.localStorage.getItem('maui-auth-v1')).toBeNull()
  })

  it('signIn abre la sesión del servidor y descarta lo privado de la cuenta anterior', async () => {
    queryClient.setQueryData(['orders', 'usr-viejo', {}], { pages: [{ items: [{ orderId: 'ajeno' }] }] })
    useCheckoutStore.getState().setCustomerPhone('3009998888')
    auth.login.mockResolvedValue(session('usr-2'))
    await useAuthStore.getState().signIn('+573105550101', 'clave-segura-123')
    expect(auth.login).toHaveBeenCalledWith('+573105550101', 'clave-segura-123')
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { id: 'usr-2' }, sessionExpired: false })
    expect(queryClient.getQueryData(['orders', 'usr-viejo', {}])).toBeUndefined()
    expect(useCheckoutStore.getState().customerPhone).toBeNull()
  })

  it('un ingreso fallido no deja sesión ni apaga el indicador de carga', async () => {
    auth.login.mockRejectedValue(new ApiError({ kind: 'unauthenticated', status: 401, message: 'x' }))
    await expect(useAuthStore.getState().signIn('+573105550101', 'mala')).rejects.toBeInstanceOf(ApiError)
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, loading: false, user: null })
  })

  it('signOut vacía la caché privada; si el servidor no confirma conserva la sesión', async () => {
    auth.login.mockResolvedValue(session('usr-1'))
    await useAuthStore.getState().signIn('+573105550101', 'clave-segura-123')
    queryClient.setQueryData(['orders', 'usr-1', {}], { pages: [] })
    auth.logout.mockRejectedValueOnce(new ApiError({ kind: 'unavailable', status: 503, message: 'x' }))
    await expect(useAuthStore.getState().signOut()).rejects.toBeInstanceOf(ApiError)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(queryClient.getQueryData(['orders', 'usr-1', {}])).toBeDefined()

    auth.logout.mockResolvedValueOnce(undefined)
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null })
    expect(queryClient.getQueryData(['orders', 'usr-1', {}])).toBeUndefined()
  })

  it('restoreSession: 401 → sin sesión; fallo de red → «failed», no «sin sesión»', async () => {
    useAuthStore.setState({ sessionStatus: 'restoring' })
    auth.me.mockResolvedValueOnce(null)
    await useAuthStore.getState().restoreSession()
    expect(useAuthStore.getState()).toMatchObject({ sessionStatus: 'ready', isAuthenticated: false })

    auth.me.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'x' }))
    await useAuthStore.getState().restoreSession()
    expect(useAuthStore.getState().sessionStatus).toBe('failed')

    auth.me.mockResolvedValueOnce(session('usr-3'))
    await useAuthStore.getState().restoreSession()
    expect(useAuthStore.getState()).toMatchObject({ sessionStatus: 'ready', isAuthenticated: true, user: { id: 'usr-3' } })
  })

  it('recargar la misma cuenta no vacía sus consultas; otra cuenta sí', async () => {
    auth.me.mockResolvedValue(session('usr-1'))
    await useAuthStore.getState().restoreSession()
    queryClient.setQueryData(['orders', 'usr-1', {}], { pages: [] })
    await useAuthStore.getState().restoreSession()
    expect(queryClient.getQueryData(['orders', 'usr-1', {}])).toBeDefined()
    auth.me.mockResolvedValue(session('usr-9'))
    await useAuthStore.getState().restoreSession()
    expect(queryClient.getQueryData(['orders', 'usr-1', {}])).toBeUndefined()
  })
})

describe('SessionLifecycle', () => {
  it('consulta la sesión al abrir y un 401 posterior la marca como expirada', async () => {
    useAuthStore.setState({ sessionStatus: 'restoring' })
    auth.me.mockResolvedValue(session('usr-1'))
    render(<SessionLifecycle />)
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
    act(() => notifySessionExpired())
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, sessionExpired: true })
  })

  it('vence por expiresAt aunque no haya peticiones', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useAuthStore.setState({ sessionStatus: 'restoring' })
    auth.me.mockResolvedValue(session('usr-1', new Date(Date.now() + 5_000).toISOString()))
    render(<SessionLifecycle />)
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000) })
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, sessionExpired: true })
  })

  it('un 401 sin sesión abierta no marca expiración', async () => {
    auth.me.mockResolvedValue(null)
    render(<SessionLifecycle />)
    await waitFor(() => expect(auth.me).toHaveBeenCalled())
    act(() => notifySessionExpired())
    expect(useAuthStore.getState().sessionExpired).toBe(false)
  })
})

describe('RequireSession', () => {
  it('espera la comprobación antes de decidir', () => {
    useAuthStore.setState({ sessionStatus: 'restoring' })
    renderGuard()
    expect(screen.getByRole('status')).toHaveTextContent('Comprobando tu sesión')
    expect(screen.queryByText('privado')).toBeNull()
  })

  it('sin sesión redirige al ingreso conservando el destino y si venció', () => {
    useAuthStore.setState({ sessionExpired: true })
    renderGuard('/pedidos')
    expect(screen.getByTestId('where').textContent).toBe('/auth|{"from":"/pedidos","expired":true}')
  })

  it('con sesión del servidor muestra la ruta privada', () => {
    useAuthStore.setState({ isAuthenticated: true, user: session().user })
    renderGuard()
    expect(screen.getByText('privado')).toBeInTheDocument()
  })

  it('si no se pudo comprobar la sesión ofrece reintentar en vez de mandar al ingreso', async () => {
    useAuthStore.setState({ sessionStatus: 'failed' })
    auth.me.mockResolvedValue(session('usr-1'))
    renderGuard()
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos comprobar tu sesión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('privado')).toBeInTheDocument()
  })
})

describe('RealAuthPage', () => {
  const renderAuth = (state?: unknown) => render(
    <MemoryRouter initialEntries={[{ pathname: '/auth', state }]}>
      <Routes>
        <Route path="/auth" element={<RealAuthPage />} />
        <Route path="/checkout" element={<p>checkout</p>} />
        <Route path="/" element={<p>inicio</p>} />
      </Routes>
    </MemoryRouter>,
  )
  const fill = (phone: string, password: string) => {
    fireEvent.change(screen.getByLabelText('Celular'), { target: { value: phone } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } })
  }

  it('ingresa con celular y contraseña y vuelve a donde iba; no ofrece enlace ficticio', async () => {
    auth.login.mockResolvedValue(session('usr-1'))
    renderAuth({ from: '/checkout' })
    expect(screen.queryByText(/Enviar enlace/i)).toBeNull()
    fill('300 123 4567', 'clave-segura-123')
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('checkout')).toBeInTheDocument()
    expect(auth.login).toHaveBeenCalledWith('+573001234567', 'clave-segura-123')
  })

  it('un 401 es «credenciales incorrectas», no «sesión expirada»', async () => {
    auth.login.mockRejectedValue(new ApiError({ kind: 'unauthenticated', status: 401, message: 'Tu sesión expiró. Vuelve a iniciar sesión.' }))
    renderAuth()
    fill('3001234567', 'mala')
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Celular o contraseña incorrectos.')).toBeInTheDocument()
  })

  it('muestra el límite de intentos y el servicio no disponible', async () => {
    auth.login
      .mockRejectedValueOnce(new ApiError({ kind: 'rate_limited', status: 429, message: 'x', retryAfterSeconds: 120 }))
      .mockRejectedValueOnce(new ApiError({ kind: 'unavailable', status: 503, message: 'El servicio no está disponible. Intenta más tarde.' }))
    renderAuth()
    fill('3001234567', 'clave')
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Demasiados intentos. Intenta de nuevo en 2 min.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('El servicio no está disponible. Intenta más tarde.')).toBeInTheDocument()
  })

  it('el celular inválido no se envía', () => {
    renderAuth()
    fill('2001234567', 'clave')
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(screen.getByText(/celular colombiano válido/)).toBeInTheDocument()
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('registro: exige nombre y contraseña de la política antes de enviar; un 409 pide ingresar', async () => {
    auth.register.mockRejectedValue(new ApiError({ kind: 'conflict', status: 409, message: 'x' }))
    renderAuth()
    fireEvent.click(screen.getByRole('button', { name: '¿Primera vez? Crea tu cuenta' }))
    fill('3001234567', 'corta')
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(auth.register).not.toHaveBeenCalled()

    fill('3001234567', 'una-clave-bastante-larga')
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await screen.findByText(/ya tiene una cuenta/)).toBeInTheDocument()
    expect(auth.register).toHaveBeenCalledWith({ name: 'Ana', phone: '+573001234567', password: 'una-clave-bastante-larga' })
  })

  it('avisa que la sesión expiró', () => {
    renderAuth({ from: '/pedidos', expired: true })
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión expiró')
  })
})
