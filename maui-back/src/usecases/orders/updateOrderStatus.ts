import { OrderStatus, type Order } from '../../domain/orders/Order.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import type { Clock } from '../../shared/clock.js'
import { NotFoundError, ValidationError } from '../../shared/errors.js'

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  received: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  preparing: [OrderStatus.READY, OrderStatus.CANCELLED],
  ready: [OrderStatus.IN_DELIVERY, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  in_delivery: [OrderStatus.DELIVERED],
  delivered: [],
  cancelled: [],
}

export interface UpdateOrderStatusDeps {
  orders: OrdersRepository
  clock: Clock
}

export const updateOrderStatus = async (
  deps: UpdateOrderStatusDeps,
  id: string,
  nextStatus: OrderStatus,
): Promise<Order> => {
  const current = await deps.orders.findById(id)
  if (!current) throw new NotFoundError('Order', id)

  const allowed = allowedTransitions[current.status]
  if (!allowed.includes(nextStatus)) {
    throw new ValidationError(
      `Invalid transition from ${current.status} to ${nextStatus}`,
    )
  }

  return deps.orders.updateStatus(id, nextStatus, deps.clock.nowIso())
}
