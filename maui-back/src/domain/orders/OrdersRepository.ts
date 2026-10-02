import type { Order, OrderStatus } from './Order.js'
import type { OrderPage, OrderPageRequest } from './orderListing.js'
import type { CommitOrderCreation, CommitOrderResult, OrderCreationIdentity, StoredOrderCreation } from './orderCreation.js'

export interface ListOrdersOptions {
  status?: OrderStatus
  limit?: number
}

export interface OrdersRepository {
  findCreation(identity: OrderCreationIdentity): Promise<StoredOrderCreation | null>
  /** Claim, cuota y pedido atómicos. Nunca deja claims/cuota si falla la persistencia. */
  createIdempotently(input: CommitOrderCreation): Promise<CommitOrderResult>
  create(order: Order): Promise<Order>
  findById(id: string): Promise<Order | null>
  /**
   * Página keyset (`createdAt DESC, id DESC`) con alcance y filtros aplicados en el almacenamiento.
   * Un fallo del driver se propaga como `OrderPersistenceError`, sin SQL ni parámetros.
   */
  listPage(request: OrderPageRequest): Promise<OrderPage>
  /** Pedidos de una tienda, más recientes primero (50 por defecto). Sin paginación: usa `listPage`. */
  listByStore(storeId: string, opts?: ListOrdersOptions): Promise<Order[]>
  updateStatus(id: string, status: OrderStatus, updatedAt: string): Promise<Order>
}
