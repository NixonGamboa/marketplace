import { canTransition } from '../../../../shared/contracts/index.js'
import type { Order, OrderStatus } from '../../domain/orders/Order.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import type { Clock } from '../../shared/clock.js'
import { NotFoundError, ValidationError } from '../../shared/errors.js'

export interface UpdateOrderStatusDeps {
  orders: OrdersRepository
  clock: Clock
}

/**
 * Cambia el estado según la máquina común (`shared/contracts/orderEnums`), que depende de la
 * modalidad. Lectura + escritura no atómicas: la condición en UPDATE es T-12.
 */
export const updateOrderStatus = async (
  deps: UpdateOrderStatusDeps,
  id: string,
  nextStatus: OrderStatus,
): Promise<Order> => {
  const current = await deps.orders.findById(id)
  if (!current) throw new NotFoundError('Order', id)

  if (!canTransition(current.status, nextStatus, current.deliveryType)) {
    throw new ValidationError(
      `Invalid transition from ${current.status} to ${nextStatus} (${current.deliveryType})`,
    )
  }

  return deps.orders.updateStatus(id, nextStatus, deps.clock.nowIso())
}
