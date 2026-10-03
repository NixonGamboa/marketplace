/**
 * Errores del login en modo real (repository simulado): un 401 son credenciales inválidas,
 * no «sesión expirada»; el resto conserva el mensaje seguro del servidor.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '@/services/http/apiError'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  toastError: vi.fn(),
  sessionExpired: false,
  toast: {} as { success: unknown; error: unknown; info: unknown },
}))
mocks.toast = { success: vi.fn(), error: mocks.toastError, info: vi.fn() }

vi.mock('@/services', () => ({ isDemoMode: false }))
vi.mock('@/auth/useSession', () => ({
  useSession: () => ({ login: mocks.login, sessionExpired: mocks.sessionExpired }),
}))
vi.mock('@/ui/Toast', () => ({ useToast: () => mocks.toast }))

import { LoginPage } from './LoginPage'

const submit = () => {
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'owner@maui.test' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'clave-segura-123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
}

describe('LoginPage (modo real, simulado)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sessionExpired = false
  })

  it('no sugiere credenciales de demo', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByLabelText('Correo electrónico')).not.toHaveAttribute('placeholder')
    expect(screen.getByLabelText('Contraseña')).not.toHaveAttribute('placeholder')
  })

  it.each([
    [new ApiError({ kind: 'unauthenticated', status: 401, message: 'Tu sesión expiró. Vuelve a iniciar sesión.' }), 'Credenciales inválidas'],
    [new ApiError({ kind: 'forbidden', status: 403, message: 'Esta cuenta no tiene acceso al panel de administración.' }), 'Esta cuenta no tiene acceso al panel de administración.'],
    [new ApiError({ kind: 'rate_limited', status: 429, message: 'Demasiados intentos.', retryAfterSeconds: 120 }), 'Demasiados intentos. Intenta de nuevo en 2 min.'],
    [new ApiError({ kind: 'unavailable', status: 503, message: 'El servicio no está disponible. Intenta más tarde.' }), 'El servicio no está disponible. Intenta más tarde.'],
    [new ApiError({ kind: 'network', message: 'No hay conexión con el servidor.' }), 'No hay conexión con el servidor.'],
  ])('muestra el mensaje adecuado ante %#', async (failure, message) => {
    mocks.login.mockRejectedValue(failure)
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    submit()
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(message))
  })

  it('avisa cuando se llegó aquí por una sesión vencida', () => {
    mocks.sessionExpired = true
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión expiró')
  })
})
