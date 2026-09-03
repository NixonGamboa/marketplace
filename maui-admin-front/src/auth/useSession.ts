/**
 * @spec CU-1 — Hook que expone el valor del AuthContext.
 * Lanza un error legible si se usa fuera de AuthProvider para facilitar debugging.
 */
import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from './AuthContext'

export function useSession(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useSession must be used inside <AuthProvider>. Wrap your app with AuthProvider.')
  }
  return ctx
}
