/**
 * Modo real con transporte simulado (no es evidencia de cierre contra API/Postgres):
 * restauración de sesión, expiración por 401 / `expiresAt` y fallo de la consulta inicial.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { Session } from '@/types/auth'

const services = vi.hoisted(() => ({
  restoreSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('@/services', () => ({
  isDemoMode: false,
  authRepo: { getSession: () => null, login: services.login, logout: services.logout },
  restoreSession: services.restoreSession,
}))

import { AuthProvider } from '../AuthContext'
import { useSession } from '../useSession'
import { notifySessionExpired } from '@/services/http/sessionExpiry'

const session = (expiresAt = '2999-01-01T00:00:00.000Z'): Session => ({
  user: { email: 'owner@maui.test', name: 'Dueño', role: 'owner', merchantId: 'store-1' },
  expiresAt,
})

function Probe() {
  const { session: current, sessionExpired, logout } = useSession()
  return (
    <div>
      <p>{current ? `sesión:${current.user.email}` : 'sin sesión'}</p>
      {sessionExpired && <p>expirada</p>}
      <button type="button" onClick={() => logout().catch(() => undefined)}>salir</button>
    </div>
  )
}

const renderProvider = () => render(<AuthProvider><Probe /></AuthProvider>)

describe('AuthProvider en modo real', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  it('no pinta nada de la app hasta que el servidor confirma la sesión', async () => {
    let resolve!: (value: Session | null) => void
    services.restoreSession.mockReturnValue(new Promise<Session | null>((done) => { resolve = done }))
    renderProvider()
    expect(screen.getByRole('status', { name: 'Comprobando sesión' })).toBeInTheDocument()
    expect(screen.queryByText('sin sesión')).not.toBeInTheDocument()
    await act(async () => { resolve(session()) })
    expect(await screen.findByText('sesión:owner@maui.test')).toBeInTheDocument()
  })

  it('sin sesión del servidor queda sin sesión (no es «expirada»)', async () => {
    services.restoreSession.mockResolvedValue(null)
    renderProvider()
    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
    expect(screen.queryByText('expirada')).not.toBeInTheDocument()
  })

  it('un fallo de la consulta no se confunde con «sin sesión» y permite reintentar', async () => {
    services.restoreSession.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(session())
    renderProvider()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo comprobar tu sesión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('sesión:owner@maui.test')).toBeInTheDocument()
    expect(services.restoreSession).toHaveBeenCalledTimes(2)
  })

  it('un 401 de cualquier petición cierra la sesión y marca la expiración', async () => {
    services.restoreSession.mockResolvedValue(session())
    renderProvider()
    await screen.findByText('sesión:owner@maui.test')
    act(() => notifySessionExpired())
    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
    expect(screen.getByText('expirada')).toBeInTheDocument()
  })

  it('al llegar expiresAt la sesión se descarta aunque no haya peticiones', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    services.restoreSession.mockResolvedValue(session(new Date(Date.now() + 5_000).toISOString()))
    renderProvider()
    await screen.findByText('sesión:owner@maui.test')
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000) })
    expect(screen.getByText('sin sesión')).toBeInTheDocument()
    expect(screen.getByText('expirada')).toBeInTheDocument()
  })

  it('si el logout falla en el servidor, la sesión local se conserva', async () => {
    services.restoreSession.mockResolvedValue(session())
    services.logout.mockRejectedValue(new Error('503'))
    renderProvider()
    await screen.findByText('sesión:owner@maui.test')
    fireEvent.click(screen.getByRole('button', { name: 'salir' }))
    await waitFor(() => expect(services.logout).toHaveBeenCalled())
    expect(screen.getByText('sesión:owner@maui.test')).toBeInTheDocument()
  })
})
