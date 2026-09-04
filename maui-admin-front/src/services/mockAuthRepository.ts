// Mock AuthRepository — login basado en credenciales en env var + fallback.
//
// Persistencia: `sessionStorage['maui-admin-session']` con `expiresAt = now + 8h`.
// `getSession()` es **síncrono** porque el guard `RequireAuth` lo necesita
// disponible al render inicial sin pasar por un suspense.

import type { AdminUser, Role, Session } from '@/types/auth'
import { mockAuditRepository } from './mockAuditRepository'
import { randomDelay } from './delay'

const SESSION_KEY = 'maui-admin-session'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 horas

export interface AuthRepository {
  login(email: string, password: string): Promise<Session>
  logout(): Promise<void>
  getSession(): Session | null
}

interface SeedUser {
  email: string
  password: string
  name: string
  role: Role
  merchantId: string
}

const FALLBACK_USERS: SeedUser[] = [
  {
    email: 'owner@lechemiel.demo',
    password: 'demo1234',
    name: 'Dueña Leche y Miel',
    role: 'owner',
    merchantId: 'mch_lechemiel',
  },
  {
    email: 'operator@lechemiel.demo',
    password: 'demo1234',
    name: 'Cajero Leche y Miel',
    role: 'operator',
    merchantId: 'mch_lechemiel',
  },
]

function readUsersFromEnv(): SeedUser[] {
  const raw = import.meta.env.VITE_ADMIN_USERS as string | undefined
  if (!raw) return FALLBACK_USERS
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return FALLBACK_USERS
    return parsed
      .filter(
        (u): u is SeedUser =>
          typeof u === 'object' &&
          u !== null &&
          typeof (u as SeedUser).email === 'string' &&
          typeof (u as SeedUser).password === 'string' &&
          typeof (u as SeedUser).name === 'string' &&
          ((u as SeedUser).role === 'owner' || (u as SeedUser).role === 'operator') &&
          typeof (u as SeedUser).merchantId === 'string',
      )
  } catch {
    return FALLBACK_USERS
  }
}

function readSessionRaw(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const session = parsed as Session
    if (typeof session.expiresAt !== 'string' || !session.user) return null
    return session
  } catch {
    return null
  }
}

function clearSession(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(SESSION_KEY)
}

export const mockAuthRepository: AuthRepository = {
  async login(email, password) {
    await randomDelay()
    const users = readUsersFromEnv()
    const match = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
    )
    if (!match) throw new Error('Credenciales inválidas')
    const user: AdminUser = {
      email: match.email,
      name: match.name,
      role: match.role,
      merchantId: match.merchantId,
    }
    const session: Session = {
      user,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    }
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    }
    await mockAuditRepository.log({
      user: user.email,
      action: 'auth.login',
      meta: { role: user.role, merchantId: user.merchantId },
    })
    return session
  },

  async logout() {
    const current = readSessionRaw()
    clearSession()
    if (current) {
      await mockAuditRepository.log({
        user: current.user.email,
        action: 'auth.logout',
      })
    }
  },

  getSession() {
    const session = readSessionRaw()
    if (!session) return null
    if (Date.parse(session.expiresAt) <= Date.now()) {
      clearSession()
      return null
    }
    return session
  },
}

export const realAuthRepository: AuthRepository = {
  login() {
    throw new Error('realAuthRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  logout() {
    throw new Error('realAuthRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  getSession() {
    throw new Error('realAuthRepository not implemented (swap from VITE_DEMO_MODE)')
  },
}
