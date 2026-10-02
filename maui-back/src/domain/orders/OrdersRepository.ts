import type { Order, OrderStatus } from './Order.js'
import type { CommitOrderCreation, CommitOrderResult, OrderCreationIdentity, StoredOrderCreation } from './orderCreation.js'

export interface ListOrdersOptions {
  status?: OrderStatus
  limit?: number
  cursor?: string
}

export interface OrdersRepository {
  findCreation(identity: OrderCreationIdentity): Promise<StoredOrderCreation | null>
  /** Claim, cuota y pedido atómicos. Nunca deja claims/cuota si falla la persistencia. */
  createIdempotently(input: CommitOrderCreation): Promise<CommitOrderResult>
  create(order: Order): Promise<Order>
  findById(id: string): Promise<Order | null>
  listByStore(storeId: string, opts?: ListOrdersOptions): Promise<Order[]>
  updateStatus(id: string, status: OrderStatus, updatedAt: string): Promise<Order>
}
