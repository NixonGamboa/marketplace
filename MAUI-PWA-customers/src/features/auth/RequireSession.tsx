import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isDemoMode } from '@/config/mode'
import { useAuthStore } from '@/stores/authStore'

/** Estado que la ruta de login recibe para volver a donde la persona iba y avisar de una sesión vencida. */
export interface AuthRedirectState {
  from?: string
  expired?: boolean
}

/**
 * Guarda de las rutas privadas (checkout, pedidos, perfil). En modo real exige la sesión que el
 * servidor confirmó; sin ella redirige al ingreso conservando el destino (el carrito persiste).
 * El demo conserva su comportamiento: no interpone nada.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const location = useLocation()
  const status = useAuthStore((s) => s.sessionStatus)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const expired = useAuthStore((s) => s.sessionExpired)
  const restoreSession = useAuthStore((s) => s.restoreSession)

  if (isDemoMode()) return <>{children}</>

  if (status === 'restoring') {
    return (
      <div role="status" className="flex items-center justify-center min-h-[60vh] text-brand-muted text-sm">
        Comprobando tu sesión…
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-3 min-h-[60vh] px-6 text-center">
        <p className="text-sm text-brand-muted">No pudimos comprobar tu sesión. Revisa tu conexión e inténtalo de nuevo.</p>
        <button
          type="button"
          onClick={() => void restoreSession()}
          className="px-5 py-2.5 bg-brand-primary text-white rounded-xl font-semibold text-sm hover:bg-brand-primary-dark transition-colors"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (!isAuthenticated) {
    const state: AuthRedirectState = { from: `${location.pathname}${location.search}`, expired }
    return <Navigate to="/auth" replace state={state} />
  }

  return <>{children}</>
}
