import type { AuthDeps } from './deps.js'

/**
 * Revoca la sesión en el servidor (no basta borrar la cookie). Idempotente: sin token o con
 * token inválido/expirado no hay nada que revocar y no se revela el motivo.
 */
export const logout = async (
  deps: Pick<AuthDeps, 'repository' | 'tokens' | 'clock'>,
  token: string | undefined | null,
): Promise<void> => {
  if (!token) return
  const claims = await deps.tokens.verify(token, deps.clock.now())
  if (!claims) return
  await deps.repository.revokeSession(claims.sessionId, claims.accountId, deps.clock.nowIso())
}
