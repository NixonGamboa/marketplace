import type { Order } from '../../domain/orders/Order.js'
import type { OrderActor } from '../../domain/orders/orderAccess.js'
import { OrderVersionConflictError, type OrderChangeContext } from '../../domain/orders/orderLifecycle.js'
import { toOrderDto } from '../../domain/orders/orderMappers.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import type { Clock } from '../../shared/clock.js'
import { getOrderForActor } from './getOrder.js'

export interface OrderChangeDeps {
  orders: Pick<OrdersRepository, 'findById' | 'saveChange'>
  clock: Clock
}

/**
 * Lectura previa a un cambio: pedido de la tienda de la cuenta (otra tienda = 404) y versión
 * enviada vigente. El rol de personal ya se exigió antes de validar el body: un cliente no
 * distingue pedidos existentes.
 */
export const readOrderForChange = async (
  deps: OrderChangeDeps,
  actor: OrderActor,
  id: string,
  expectedVersion: number,
): Promise<{ current: Order; context: OrderChangeContext }> => {
  const current = await getOrderForActor(deps, actor, id)
  if (current.version !== expectedVersion) throw new OrderVersionConflictError()
  return { current, context: { actorId: actor.id, now: deps.clock.nowIso() } }
}

/**
 * Guarda `next` solo si la fila sigue como se leyó; si otro cambio ganó entre lectura y escritura
 * responde el mismo 409. El DTO se valida antes de escribir: nunca se persiste un pedido ilegible.
 */
export const commitOrderChange = async (
  deps: OrderChangeDeps,
  current: Order,
  next: Order,
  products: { id: string; version: number }[] = [],
): Promise<Order> => {
  toOrderDto(next)
  const saved = await deps.orders.saveChange({
    expected: { id: current.id, storeId: current.storeId, version: current.version, status: current.status },
    next,
    products,
  })
  if (!saved) throw new OrderVersionConflictError()
  return saved
}
