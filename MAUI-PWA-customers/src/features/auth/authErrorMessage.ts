import { ApiError } from '@/services/http/apiError'

export type AuthMode = 'login' | 'register'

/** Un 401 en el ingreso son credenciales inválidas (no «sesión expirada»); el resto usa el mensaje seguro del servidor. */
export function authErrorMessage(error: unknown, mode: AuthMode): string {
  if (!(error instanceof ApiError)) return 'No pudimos completar la solicitud. Inténtalo de nuevo.'
  switch (error.kind) {
    case 'unauthenticated':
      return 'Celular o contraseña incorrectos.'
    case 'conflict':
      return mode === 'register' ? 'Ese celular ya tiene una cuenta. Ingresa con tu contraseña.' : error.message
    case 'rate_limited':
      return error.retryAfterSeconds
        ? `Demasiados intentos. Intenta de nuevo en ${Math.max(1, Math.ceil(error.retryAfterSeconds / 60))} min.`
        : error.message
    case 'invalid_request':
    case 'validation':
      return mode === 'register' ? 'Revisa tu nombre, celular y contraseña.' : 'Celular o contraseña incorrectos.'
    default:
      return error.message
  }
}
