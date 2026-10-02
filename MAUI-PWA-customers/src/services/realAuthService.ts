// Auth real de la PWA: cuenta de CLIENTE con sesión por cookie HttpOnly. La identidad sale del
// servidor (`/auth/session`), nunca del perfil guardado en localStorage.

import { authSessionResponseSchema, loginRequestSchema, registerRequestSchema } from '@shared/contracts'
import { apiClient, type ApiClient } from './http/apiClient'
import { ApiError } from './http/apiError'
import { validateRequest } from './http/validateRequest'
import { customerSessionFrom, type CustomerSession } from './real/adapters'

export interface RequestOptions {
  signal?: AbortSignal
}

export interface RealAuthService {
  /** Alta de cliente; abre sesión. El teléfono es contacto NO verificado. */
  register(input: { name: string; phone: string; password: string }): Promise<CustomerSession>
  login(phone: string, password: string): Promise<CustomerSession>
  /** Sesión vigente según el servidor; `null` si no hay (401). */
  me(options?: RequestOptions): Promise<CustomerSession | null>
  logout(): Promise<void>
  /** Reflejo en memoria de la última respuesta del servidor (nunca de localStorage). */
  getSession(): CustomerSession | null
  /** Devuelve la sesión en memoria vigente o la consulta al servidor. */
  ensureSession(options?: RequestOptions): Promise<CustomerSession | null>
}

const NOT_CUSTOMER_MESSAGE = 'Esta cuenta no es de cliente. Usa el panel de administración.'

export const createRealAuthService = (client: ApiClient = apiClient): RealAuthService => {
  let current: CustomerSession | null = null
  let pendingMe: Promise<CustomerSession | null> | null = null

  const getSession: RealAuthService['getSession'] = () => {
    if (current !== null && Date.parse(current.expiresAt) <= Date.now()) current = null
    return current
  }

  const logoutOnServer = () => client.request({ method: 'POST', path: '/auth/logout' })

  const openSession = async (path: string, body: unknown): Promise<CustomerSession> => {
    const session = customerSessionFrom(await client.request({ method: 'POST', path, body, schema: authSessionResponseSchema }))
    if (session === null) {
      // El servidor ya abrió una sesión de personal: se cierra para no dejar una cookie ajena a la PWA.
      await logoutOnServer().catch(() => undefined)
      current = null
      throw new ApiError({ kind: 'forbidden', status: 403, message: NOT_CUSTOMER_MESSAGE })
    }
    current = session
    return session
  }

  const me: RealAuthService['me'] = async (options) => {
    try {
      current = customerSessionFrom(
        await client.request({ path: '/auth/session', schema: authSessionResponseSchema, ...(options?.signal ? { signal: options.signal } : {}) }),
      )
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unauthenticated') {
        current = null
        return null
      }
      throw error
    }
    return current
  }

  return {
    async register(input) {
      return openSession('/auth/register', validateRequest(registerRequestSchema, input))
    },

    async login(phone, password) {
      return openSession('/auth/login', validateRequest(loginRequestSchema, { method: 'phone', phone, password }))
    },

    me,

    async logout() {
      try {
        await logoutOnServer()
      } catch (error) {
        // Sesión ya vencida: nada que cerrar. Otros fallos dejan la cookie viva: no se finge el cierre.
        if (!(error instanceof ApiError && error.kind === 'unauthenticated')) throw error
      }
      current = null
    },

    getSession,

    async ensureSession(options) {
      // Consultas simultáneas comparten una sola petición a /auth/session.
      const cached = getSession()
      if (cached !== null) return cached
      pendingMe ??= me(options).finally(() => { pendingMe = null })
      return pendingMe
    },
  }
}

export const realAuthService: RealAuthService = createRealAuthService()
