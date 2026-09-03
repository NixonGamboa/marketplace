/**
 * @spec CU-1, SC-1, §7 — Guard de rutas con verificación de rol.
 * - Sin sesión → redirige a /login con state.from para volver luego del login.
 * - Con sesión pero rol insuficiente → toast 'Sin permiso' + redirige a /.
 * - Con sesión y rol permitido → renderiza children.
 * Role 'viewer' fue descartado del scope; sólo 'owner' y 'operator' existen.
 */
import { useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Role } from '@/types/auth'
import { useSession } from './useSession'
import { useToast } from '@/ui/Toast'

interface RequireAuthProps {
  children: React.ReactNode
  role?: Role | Role[]
}

export function RequireAuth({ children, role }: RequireAuthProps) {
  const { session } = useSession()
  const location = useLocation()
  const toast = useToast()
  // Track whether we've already fired the toast to avoid duplicates in Strict Mode
  const toastedRef = useRef(false)

  const allowed = role ? (Array.isArray(role) ? role : [role]) : null
  const hasInsufficientRole = session && allowed && !allowed.includes(session.user.role)

  useEffect(() => {
    if (hasInsufficientRole && !toastedRef.current) {
      toastedRef.current = true
      toast.error('Sin permiso')
    }
    // Reset ref when role requirements change
    if (!hasInsufficientRole) {
      toastedRef.current = false
    }
  }, [hasInsufficientRole, toast])

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (hasInsufficientRole) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
