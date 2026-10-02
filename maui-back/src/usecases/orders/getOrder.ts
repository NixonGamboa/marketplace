import type { Order } from '../../domain/orders/Order.js'
import { canAccessOrder, type OrderActor } from '../../domain/orders/orderAccess.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import { NotFoundError } from '../../shared/errors.js'

/**
 * Lee un pedido visible para el actor. Un pedido ajeno (otro cliente u otra tienda) lanza el
 * mismo `NotFoundError` que uno inexistente: conocer el ID no revela si existe.
 */
export const getOrderForActor = async (
  deps: { orders: Pick<OrdersRepository, 'findById'> },
  actor: OrderActor,
  id: string,
): Promise<Order> => {
  const order = await deps.orders.findById(id)
  if (!order || !canAccessOrder(actor, order)) throw new NotFoundError('Order', id)
  return order
}
