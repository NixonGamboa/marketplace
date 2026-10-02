import {
  MAX_COP_AMOUNT,
  OrderStatus,
  calculateOrderTotals,
  createOrderRequestSchema,
  issuesFromZodError,
} from '../../../../shared/contracts/index.js'
import type { AuthRepository } from '../../domain/auth/AuthRepository.js'
import { AuthorizationError } from '../../domain/auth/errors.js'
import type { BucketKeyer } from '../../domain/auth/ports.js'
import type { Order, OrderContext } from '../../domain/orders/Order.js'
import {
  ORDER_CREATE_BUCKET_SCOPE,
  ORDER_CREATE_POLICY,
  assertCanCreateOrder,
  type OrderActor,
} from '../../domain/orders/orderAccess.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import type { Clock } from '../../shared/clock.js'
import { ValidationError } from '../../shared/errors.js'
import { newId } from '../../shared/ids.js'
import { reserveAttemptOrThrow } from '../auth/reserveAttempt.js'

export interface CreateOrderDeps {
  orders: OrdersRepository
  clock: Clock
  /** Reservas persistentes del límite de creación por cuenta. */
  attempts: Pick<AuthRepository, 'reserveAttempt'>
  keys: BucketKeyer
}

/**
 * Crea un pedido del cliente autenticado. El dueño es el `actor` (sesión vigente) y la tienda
 * la decide el servidor (`context`); el body no puede fijar ninguno de los dos. El `userId`
 * del contrato debe coincidir con el actor: distinto es manipulación y se deniega.
 *
 * Orden: rol → validación → límite por cuenta → persistencia. Un request inválido o de un rol
 * sin permiso no consume cupo.
 *
 * LÍMITE VIGENTE (T-10): precio/nombre de los ítems los envía el cliente; el servidor aún
 * no los contrasta con el catálogo ni aplica idempotencia. Totales y redondeo sí se calculan aquí.
 */
export const createOrder = async (
  deps: CreateOrderDeps,
  actor: OrderActor,
  input: unknown,
  context: OrderContext,
): Promise<Order> => {
  assertCanCreateOrder(actor)

  const parsed = createOrderRequestSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError('Invalid order input', issuesFromZodError(parsed.error))
  }

  const data = parsed.data
  if (data.userId !== actor.id) throw new AuthorizationError()

  const { estimatedTotal } = calculateOrderTotals(data.items, data.shippingCost)
  if (estimatedTotal > MAX_COP_AMOUNT) {
    throw new ValidationError(`El total estimado supera el máximo permitido (${MAX_COP_AMOUNT} COP)`)
  }

  await reserveAttemptOrThrow(
    { repository: deps.attempts, clock: deps.clock },
    { bucket: deps.keys.key(ORDER_CREATE_BUCKET_SCOPE, actor.id), ...ORDER_CREATE_POLICY },
  )

  const now = deps.clock.nowIso()

  const order: Order = {
    id: newId(),
    storeId: context.storeId,
    customerId: actor.id,
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
