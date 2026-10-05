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

  it('enviar vacío muestra el error junto a cada campo, enfoca el primero y no llama al login', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    const button = screen.getByRole('button', { name: 'Iniciar sesión' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    const email = screen.getByLabelText('Correo electrónico')
    const password = screen.getByLabelText('Contraseña')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAttribute('aria-describedby', 'login-email-error')
    expect(document.getElementById('login-email-error')).toHaveTextContent('Escribe tu correo electrónico.')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-describedby', 'login-password-error')
    expect(document.getElementById('login-password-error')).toHaveTextContent('Escribe tu contraseña.')
    expect(email).toHaveFocus()
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('rechaza un correo mal formado y se recupera al corregirlo', async () => {
    mocks.login.mockResolvedValue(undefined)
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    const email = screen.getByLabelText('Correo electrónico')
    fireEvent.change(email, { target: { value: 'sin-arroba' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById('login-email-error')).toHaveTextContent('correo válido')
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'false')
    expect(mocks.login).not.toHaveBeenCalled()

    fireEvent.change(email, { target: { value: 'owner@maui.test' } })
    expect(email).toHaveAttribute('aria-invalid', 'false')
    expect(document.getElementById('login-email-error')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    // La contraseña solo es obligatoria: no se le impone la longitud del alta.
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith('owner@maui.test', 'x'))
  })

  it.each(['a@@dominio.com', 'a@b', 'a b@dominio.com', 'nombre@'])(
    'el correo %s que el contrato rechaza se señala en el campo y no se envía',
    (invalid) => {
      render(<MemoryRouter><LoginPage /></MemoryRouter>)
      const email = screen.getByLabelText('Correo electrónico')
      fireEvent.change(email, { target: { value: invalid } })
      fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'x' } })
      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
      expect(email).toHaveAttribute('aria-invalid', 'true')
      expect(document.getElementById('login-email-error')).toHaveTextContent('correo válido')
      expect(mocks.login).not.toHaveBeenCalled()
      expect(mocks.toastError).not.toHaveBeenCalled()
    },
  )

  it('acepta un correo válido con mayúsculas y espacios y envía la contraseña tal cual', async () => {
    mocks.login.mockResolvedValue(undefined)
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: '  Owner@Maui.test ' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith('Owner@Maui.test', 'x'))
  })

  it('deshabilita el formulario solo durante la petición y conserva el error del servidor', async () => {
    let fail: (reason: unknown) => void = () => {}
    mocks.login.mockReturnValue(new Promise((_, reject) => { fail = reject }))
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    submit()
    expect(await screen.findByRole('button', { name: /Iniciando sesión/ })).toBeDisabled()
    fail(new ApiError({ kind: 'unauthenticated', status: 401, message: 'x' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Credenciales inválidas'))
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled()
  })

  it('avisa cuando se llegó aquí por una sesión vencida', () => {
    mocks.sessionExpired = true
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión expiró')
  })
})
