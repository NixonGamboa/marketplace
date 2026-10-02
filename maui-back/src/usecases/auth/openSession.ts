import type { Account } from '../../domain/auth/Account.js'
import type { AuthSession } from '../../domain/auth/AuthSession.js'
import { SESSION_TTL_SECONDS } from '../../domain/auth/policy.js'
import type { AuthDeps, IssuedSession } from './deps.js'

/** Persiste una sesión nueva y firma su JWT. El rol/tienda no se copian al token. */
export const openSession = async (
  deps: Pick<AuthDeps, 'repository' | 'tokens' | 'ids' | 'clock'>,
  account: Account,
): Promise<IssuedSession> => {
  const now = deps.clock.now()
  const issuedAt = Math.floor(now.getTime() / 1000)
  const expiresAt = issuedAt + SESSION_TTL_SECONDS

  const session: AuthSession = {
    id: deps.ids.sessionId(),
    accountId: account.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    revokedAt: null,
  }
  await deps.repository.createSession(session)

  const token = await deps.tokens.sign({
    accountId: account.id,
    sessionId: session.id,
    issuedAt,
    expiresAt,
  })
  return { token, account, expiresAt: session.expiresAt }
}
