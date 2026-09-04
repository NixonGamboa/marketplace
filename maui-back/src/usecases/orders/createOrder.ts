import { newOrderInputSchema, OrderStatus, type NewOrderInput, type Order } from '../../domain/orders/Order.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import type { Clock } from '../../shared/clock.js'
import { ValidationError } from '../../shared/errors.js'
import { newId } from '../../shared/ids.js'

export interface CreateOrderDeps {
  orders: OrdersRepository
  clock: Clock
}

export const createOrder = async (
  deps: CreateOrderDeps,
  input: unknown,
): Promise<Order> => {
  const parsed = newOrderInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Invalid order input', parsed.error.flatten())
  }

  const data: NewOrderInput = parsed.data

  if (data.deliveryMode === 'delivery' && !data.deliveryAddress) {
    throw new ValidationError('deliveryAddress is required when deliveryMode is delivery')
  }

  for (const item of data.items) {
    if (item.isVariableWeight && item.kilos === undefined) {
      throw new ValidationError(`Item ${item.productId} requires kilos (variable weight)`)
    }
    if (!item.isVariableWeight && item.quantity === undefined) {
      throw new ValidationError(`Item ${item.productId} requires quantity`)
    }
  }

  const total = data.items.reduce((sum, item) => {
    const units = item.isVariableWeight ? (item.kilos ?? 0) : (item.quantity ?? 0)
    return sum + Math.round(item.priceAtMoment * units)
  }, 0)

  const now = deps.clock.nowIso()

  const order: Order = {
    ...data,
    id: newId(),
    total,
    status: OrderStatus.RECEIVED,
    createdAt: now,
    updatedAt: now,
  }

  return deps.orders.create(order)
}
