import type { Order, OrderStatus } from '../../src/domain/orders/Order.js'
import type { OrdersRepository } from '../../src/domain/orders/OrdersRepository.js'

/**
 * Lleva un pedido fixture a `status` por la escritura condicional del adapter, sin pasar por la
 * máquina de estados: prepara escenarios (listados, retries) que no prueban transiciones.
 */
export async function forceStatus(
  orders: Pick<OrdersRepository, 'findById' | 'saveChange'>,
  id: string,
  status: OrderStatus,
  updatedAt?: string,
): Promise<Order> {
  const current = await orders.findById(id)
  if (!current) throw new Error(`Fixture inexistente: ${id}`)
  const saved = await orders.saveChange({
    expected: current,
    next: { ...current, status, version: current.version + 1, updatedAt: updatedAt ?? current.updatedAt },
    products: [],
  })
  if (!saved) throw new Error(`Fixture cambiada en paralelo: ${id}`)
  return saved
}
