import type { Account } from '../auth/Account.js'
import type { RateLimitRule } from '../auth/AuthRepository.js'
import { AuthorizationError } from '../auth/errors.js'
import type { Order } from './Order.js'

/**
 * Actor de una operación sobre pedidos. Sale SIEMPRE de la sesión y la cuenta vigentes
 * (`authenticateSession`), nunca del body, de cabeceras ni de un ID conocido.
 */
export type OrderActor = Pick<Account, 'id' | 'role' | 'storeId'>

/** Solo un cliente crea pedidos propios. Pedidos para terceros quedan fuera (E-06). */
export const assertCanCreateOrder = (actor: OrderActor): void => {
  if (actor.role !== 'customer') throw new AuthorizationError()
}

/** Cambiar estado es operación de personal (owner/operator); la tienda se comprueba aparte. */
export const assertCanUpdateOrderStatus = (actor: OrderActor): void => {
  if (actor.role !== 'owner' && actor.role !== 'operator') throw new AuthorizationError()
}

/**
 * Visibilidad de un pedido persistido. Cliente: solo los suyos. Personal: solo los de su
 * tienda, comparando la tienda de su cuenta con la guardada en el pedido. Quien no lo ve
 * debe recibir el mismo resultado que si no existiera.
 */
export const canAccessOrder = (actor: OrderActor, order: Pick<Order, 'customerId' | 'storeId'>): boolean => {
  if (actor.role === 'customer') return order.customerId === actor.id
  return actor.storeId !== null && order.storeId === actor.storeId
}

/**
 * Creación de pedidos por cuenta y ventana. La clave es la cuenta autenticada: no depende de
 * cabeceras de IP reenviables. El alta de cuentas ya tiene cota global (`REGISTER_GLOBAL_POLICY`).
 * Estos valores están fijados también en `maui_commit_order` (migración 0004), que rechaza
 * cualquier otro límite/ventana; cambiarlos exige una migración nueva (lo vigila una prueba).
 */
export const ORDER_CREATE_POLICY: Pick<RateLimitRule, 'limit' | 'windowSeconds'> = {
  limit: 20,
  windowSeconds: 60 * 60,
}
export const ORDER_CREATE_BUCKET_SCOPE = 'orders:create'
