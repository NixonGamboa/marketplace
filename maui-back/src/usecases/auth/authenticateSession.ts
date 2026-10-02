import { hasConsistentIdentity, type Account } from '../../domain/auth/Account.js'
import { AuthenticationError } from '../../domain/auth/errors.js'
import type { AuthDeps } from './deps.js'

/** Identidad autenticada. Rol y tienda salen de la BD en cada llamada, no del JWT. */
export interface AuthContext {
  account: Account
  sessionId: string
  /** ISO UTC. */
  expiresAt: string
}

/**
 * Valida el JWT (firma, algoritmo, issuer/audience, claims) y luego exige sesión
 * persistida vigente (no revocada, no expirada) y cuenta activa e íntegra.
 * Cualquier fallo es el mismo `AuthenticationError`.
 */
export const authenticateSession = async (
  deps: Pick<AuthDeps, 'repository' | 'tokens' | 'clock'>,
  token: string | undefined | null,
): Promise<AuthContext> => {
  if (!token) throw new AuthenticationError()

  const now = deps.clock.now()
  const claims = await deps.tokens.verify(token, now)
  if (!claims) throw new AuthenticationError()

  const found = await deps.repository.findSessionWithAccount(claims.sessionId)
  if (!found) throw new AuthenticationError()

  const { session, account } = found
  const sessionExpiresAtMs = Date.parse(session.expiresAt)
  const valid =
    session.accountId === claims.accountId &&
    account.id === claims.accountId &&
    session.revokedAt === null &&
    Number.isFinite(sessionExpiresAtMs) &&
    sessionExpiresAtMs > now.getTime() &&
    claims.expiresAt <= Math.floor(sessionExpiresAtMs / 1000) &&
    account.status === 'active' &&
    hasConsistentIdentity(account)
  if (!valid) throw new AuthenticationError()

  return { account, sessionId: session.id, expiresAt: session.expiresAt }
}
