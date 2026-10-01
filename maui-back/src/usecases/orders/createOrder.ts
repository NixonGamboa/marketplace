import {
  MAX_COP_AMOUNT,
  OrderStatus,
  calculateOrderTotals,
  createOrderRequestSchema,
  issuesFromZodError,
} from '../../../../shared/contracts/index.js'
import type { Order, OrderContext } from '../../domain/orders/Order.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import type { Clock } from '../../shared/clock.js'
import { ValidationError } from '../../shared/errors.js'
import { newId } from '../../shared/ids.js'

export interface CreateOrderDeps {
  orders: OrdersRepository
  clock: Clock
}

/**
 * Crea un pedido a partir del request público validado por el contrato compartido.
 * Tienda y cliente provienen del `context` confiable, no del body (ver `OrderContext`).
 *
 * LÍMITE VIGENTE (T-10): precio/nombre de los ítems los envía el cliente; el servidor aún
 * no los contrasta con el catálogo ni aplica idempotencia. Totales y redondeo sí se calculan aquí.
 */
export const createOrder = async (
  deps: CreateOrderDeps,
  input: unknown,
  context: OrderContext,
): Promise<Order> => {
  const parsed = createOrderRequestSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Invalid order input', issuesFromZodError(parsed.error))
  }

  const data = parsed.data
  const { estimatedTotal } = calculateOrderTotals(data.items, data.shippingCost)
  if (estimatedTotal > MAX_COP_AMOUNT) {
    throw new ValidationError(`El total estimado supera el máximo permitido (${MAX_COP_AMOUNT} COP)`)
  }

  const now = deps.clock.nowIso()

  const order: Order = {
    id: newId(),
    storeId: context.storeId,
    customerId: context.customerId ?? data.userId,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    items: data.items,
    status: OrderStatus.RECEIVED,
    deliveryType: data.deliveryType,
    deliveryData: data.deliveryData,
    substitutionPreference: data.substitutionPreference,
    shippingCost: data.shippingCost,
    estimatedTotal,
    createdAt: now,
    updatedAt: now,
  }

  return deps.orders.create(order)
}
