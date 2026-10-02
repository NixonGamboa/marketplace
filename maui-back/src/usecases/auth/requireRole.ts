import type { AccountRole } from '../../../../shared/contracts/index.js'
import { AuthorizationError } from '../../domain/auth/errors.js'
import type { AuthContext } from './authenticateSession.js'

/**
 * Primitiva genérica de autorización por rol. Los pedidos aplican además propiedad y tienda
 * mediante `domain/orders/orderAccess`; un rol válido no basta para operar un pedido ajeno.
 */
export const requireRole = (context: AuthContext, ...allowed: readonly AccountRole[]): AuthContext => {
  if (!allowed.includes(context.account.role)) throw new AuthorizationError()
  return context
}
