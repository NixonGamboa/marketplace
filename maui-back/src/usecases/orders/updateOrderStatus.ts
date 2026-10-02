import { canTransition } from '../../../../shared/contracts/index.js'
import type { Order, OrderStatus } from '../../domain/orders/Order.js'
import { assertCanUpdateOrderStatus, type OrderActor } from '../../domain/orders/orderAccess.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import type { Clock } from '../../shared/clock.js'
import { ValidationError } from '../../shared/errors.js'
import { getOrderForActor } from './getOrder.js'

export interface UpdateOrderStatusDeps {
  orders: OrdersRepository
  clock: Clock
}

/**
 * Cambia el estado según la máquina común (`shared/contracts/orderEnums`), que depende de la
 * modalidad. Solo personal de la tienda del pedido; el rol se exige antes de leer, así un
 * cliente no distingue pedidos existentes. Otra tienda responde como inexistente.
 *
 * Lectura + escritura no atómicas: la condición en UPDATE es T-12.
 */
export const updateOrderStatus = async (
  deps: UpdateOrderStatusDeps,
  actor: OrderActor,
  id: string,
  nextStatus: OrderStatus,
): Promise<Order> => {
  assertCanUpdateOrderStatus(actor)
  const current = await getOrderForActor(deps, actor, id)

  if (!canTransition(current.status, nextStatus, current.deliveryType)) {
    throw new ValidationError(
      `Invalid transition from ${current.status} to ${nextStatus} (${current.deliveryType})`,
    )
  }

  return deps.orders.updateStatus(id, nextStatus, deps.clock.nowIso())
}
