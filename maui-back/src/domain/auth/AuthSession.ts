import type { Account } from './Account.js'

/** Sesión persistente y revocable. `id` es el `jti` del JWT. */
export interface AuthSession {
  id: string
  accountId: string
  /** ISO UTC. */
  createdAt: string
  expiresAt: string
  revokedAt: string | null
}

export interface SessionWithAccount {
  session: AuthSession
  account: Account
}
