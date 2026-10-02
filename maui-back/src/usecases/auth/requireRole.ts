import type { AccountRole } from '../../../../shared/contracts/index.js'
import { AuthorizationError } from '../../domain/auth/errors.js'
import type { AuthContext } from './authenticateSession.js'

/**
 * Primitiva de autorización por rol para T-06. NO está conectada todavía a los endpoints de
 * pedidos: hasta T-06 esos endpoints siguen sin autorización (limitación vigente de T-05).
 */
export const requireRole = (context: AuthContext, ...allowed: readonly AccountRole[]): AuthContext => {
  if (!allowed.includes(context.account.role)) throw new AuthorizationError()
  return context
}
