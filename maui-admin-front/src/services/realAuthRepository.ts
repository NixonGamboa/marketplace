// AuthRepository real: sesión por cookie HttpOnly (el token nunca llega a JavaScript).
// La sesión en memoria es solo un reflejo de la respuesta del servidor; `me()` la reconcilia.

import { authSessionResponseSchema, loginRequestSchema } from '@shared/contracts'
import type { Session } from '@/types/auth'
import { apiClient, type ApiClient } from './http/apiClient'
import { ApiError } from './http/apiError'
import { validateRequest } from './http/validateRequest'
import { staffSessionFrom } from './real/adapters'
import type { AuthRepository } from './mockAuthRepository'

export interface RequestOptions {
  signal?: AbortSignal
}

export interface RealAuthRepository extends AuthRepository {
  /** Cuenta vigente según el servidor; `null` si no hay sesión de personal. Rehidrata `getSession()`. */
  me(options?: RequestOptions): Promise<Session | null>
}

const NOT_STAFF_MESSAGE = 'Esta cuenta no tiene acceso al panel de administración.'

export const createRealAuthRepository = (client: ApiClient = apiClient): RealAuthRepository => {
  let current: Session | null = null

  const requestSession = async (method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal) =>
    client.request({ method, path, schema: authSessionResponseSchema, ...(body !== undefined ? { body } : {}), ...(signal ? { signal } : {}) })

  const logoutOnServer = () => client.request({ method: 'POST', path: '/auth/logout' })

  return {
    async login(email, password) {
      const body = validateRequest(loginRequestSchema, { method: 'email', email, password })
      const session = staffSessionFrom(await requestSession('POST', '/auth/login', body))
      if (session === null) {
        // El servidor ya abrió una sesión de cliente: se cierra para no dejar una cookie ajena al panel.
        await logoutOnServer().catch(() => undefined)
        current = null
        throw new ApiError({ kind: 'forbidden', status: 403, message: NOT_STAFF_MESSAGE })
      }
      current = session
      return session
    },

    async me(options) {
      try {
        current = staffSessionFrom(await requestSession('GET', '/auth/session', undefined, options?.signal))
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'unauthenticated') {
          current = null
          return null
        }
        throw error
      }
      return current
    },

    async logout() {
      try {
        await logoutOnServer()
      } catch (error) {
        // Sesión ya vencida: no hay nada que cerrar. Otros fallos (503) dejan la cookie viva: no se finge el cierre.
        if (!(error instanceof ApiError && error.kind === 'unauthenticated')) throw error
      }
      current = null
    },

    getSession() {
      if (current !== null && Date.parse(current.expiresAt) <= Date.now()) current = null
      return current
    },
  }
}

export const realAuthRepository: RealAuthRepository = createRealAuthRepository()
