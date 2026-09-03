/**
 * @spec CU-1, SC-1 — Contexto de autenticación del panel admin.
 * Provee { session, login, logout } a toda la app.
 * La sesión inicial se lee síncronamente desde mockAuthRepository.getSession()
 * para que RequireAuth no tenga que esperar un efecto en el primer render.
 */
import { createContext, useState, useCallback, type ReactNode } from 'react'
import type { Session } from '@/types/auth'
import { authRepo } from '@/services'

export interface AuthContextValue {
  session: Session | null
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => authRepo.getSession())

  const login = useCallback(async (email: string, password: string) => {
    const newSession = await authRepo.login(email, password)
    setSession(newSession)
  }, [])

  const logout = useCallback(async () => {
    await authRepo.logout()
    setSession(null)
  }, [])

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
