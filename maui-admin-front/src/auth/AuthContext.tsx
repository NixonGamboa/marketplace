/**
 * @spec CU-1, SC-1 — Contexto de autenticación del panel admin.
 * Provee { session, login, logout, sessionExpired } a toda la app.
 * Demo: la sesión inicial se lee síncronamente del repository local.
 * Real: se consulta al servidor (cookie HttpOnly) antes de pintar; si la sesión vence (401 de
 * cualquier petición o `expiresAt`) se limpia y el guard redirige al login con aviso.
 */
import { createContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Session } from '@/types/auth'
import { authRepo, isDemoMode, restoreSession } from '@/services'
import { onSessionExpired } from '@/services/http/sessionExpiry'
import { Spinner } from '@/ui/Spinner'

export interface AuthContextValue {
  session: Session | null
  /** `true` si la sesión anterior venció (401 o `expiresAt`) y el usuario aún no volvió a entrar. */
  sessionExpired: boolean
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

type RestoreState = 'restoring' | 'ready' | 'failed'

/** Un `setTimeout` no admite más de ~24.8 días; una sesión más larga se reevalúa al despertar. */
const MAX_TIMER_MS = 2_147_483_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => (isDemoMode ? authRepo.getSession() : null))
  const [restore, setRestore] = useState<RestoreState>(isDemoMode ? 'ready' : 'restoring')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (isDemoMode) return
    const controller = new AbortController()
    setRestore('restoring')
    restoreSession(controller.signal).then(
      (restored) => {
        setSession(restored)
        setRestore('ready')
      },
      () => {
        if (!controller.signal.aborted) setRestore('failed')
      },
    )
    return () => controller.abort()
  }, [attempt])

  const expire = useCallback(() => {
    setSession((current) => {
      if (current !== null) setSessionExpired(true)
      return null
    })
  }, [])

  // Un 401 fuera de `/auth/*` significa que la cookie ya no vale, aunque `expiresAt` no haya llegado.
  useEffect(() => (isDemoMode ? undefined : onSessionExpired(expire)), [expire])

  useEffect(() => {
    if (isDemoMode || session === null) return
    const remaining = Date.parse(session.expiresAt) - Date.now()
    const timer = setTimeout(expire, Math.min(Math.max(remaining, 0), MAX_TIMER_MS))
    return () => clearTimeout(timer)
  }, [session, expire])

  const login = useCallback(async (email: string, password: string) => {
    const newSession = await authRepo.login(email, password)
    setSessionExpired(false)
    setSession(newSession)
  }, [])

  const logout = useCallback(async () => {
    await authRepo.logout()
    setSessionExpired(false)
    setSession(null)
  }, [])

  if (restore === 'restoring') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={32} label="Comprobando sesión" />
      </div>
    )
  }

  if (restore === 'failed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p role="alert" className="text-sm text-gray-700">
          No se pudo comprobar tu sesión. Revisa la conexión e inténtalo de nuevo.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ session, sessionExpired, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
