import type { Order, OrderStatus } from './Order.js'

export interface ListOrdersOptions {
  status?: OrderStatus
  limit?: number
  cursor?: string
}

export interface OrdersRepository {
  create(order: Order): Promise<Order>
  findById(id: string): Promise<Order | null>
  listByStore(storeId: string, opts?: ListOrdersOptions): Promise<Order[]>
  updateStatus(id: string, status: OrderStatus, updatedAt: string): Promise<Order>
}
