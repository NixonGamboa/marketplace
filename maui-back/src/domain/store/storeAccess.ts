import { isStaffRole, type Account } from '../auth/Account.js'
import { AuthorizationError } from '../auth/errors.js'

/**
 * Actor de operaciones de tienda/catálogo. Sale SIEMPRE de la sesión y la cuenta vigentes
 * (`authenticateSession`); el body, las cabeceras o un ID conocido nunca aportan tienda.
 */
export type StoreActor = Pick<Account, 'id' | 'role' | 'storeId'>

/** Tienda del personal (owner/operator). Cliente o cuenta sin tienda: 403. */
export const staffStoreOf = (actor: StoreActor): string => {
  if (!isStaffRole(actor.role) || actor.storeId === null) throw new AuthorizationError()
  return actor.storeId
}

/**
 * Tienda que el actor puede administrar: solo owner. Refleja el admin actual, donde
 * `/catalogo`, `/categorias`, `/tienda` y `/configuracion` exigen `RequireAuth role="owner"`
 * y el operador solo lee productos desde el detalle de pedidos.
 */
export const ownedStoreOf = (actor: StoreActor): string => {
  const storeId = staffStoreOf(actor)
  if (actor.role !== 'owner') throw new AuthorizationError()
  return storeId
}
