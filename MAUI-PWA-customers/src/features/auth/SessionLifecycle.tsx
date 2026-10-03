import { useEffect } from 'react'
import { isDemoMode } from '@/config/mode'
import { onSessionExpired } from '@/services/http/sessionExpiry'
import { useAuthStore } from '@/stores/authStore'

/** Un `setTimeout` no admite más de ~24.8 días; una sesión más larga se reevalúa al despertar. */
const MAX_TIMER_MS = 2_147_483_000

/**
 * Ciclo de vida de la sesión real: la consulta al abrir la app, el aviso de un 401 de cualquier
 * petición y el vencimiento por `expiresAt`. No renderiza nada; en el demo es inerte.
 */
export function SessionLifecycle() {
  const restoreSession = useAuthStore((s) => s.restoreSession)
  const expireSession = useAuthStore((s) => s.expireSession)
  const expiresAt = useAuthStore((s) => s.sessionExpiresAt)

  useEffect(() => {
    if (isDemoMode()) return
    const controller = new AbortController()
    void restoreSession(controller.signal)
    return () => controller.abort()
  }, [restoreSession])

  useEffect(() => (isDemoMode() ? undefined : onSessionExpired(expireSession)), [expireSession])

  useEffect(() => {
    if (isDemoMode() || expiresAt === null) return
    const remaining = Date.parse(expiresAt) - Date.now()
    const timer = setTimeout(expireSession, Math.min(Math.max(remaining, 0), MAX_TIMER_MS))
    return () => clearTimeout(timer)
  }, [expiresAt, expireSession])

  return null
}
