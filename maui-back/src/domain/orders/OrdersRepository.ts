import type { Order, OrderStatus } from './Order.js'
import type { OrderPage, OrderPageRequest } from './orderListing.js'
import type { CommitOrderCreation, CommitOrderResult, OrderCreationIdentity, StoredOrderCreation } from './orderCreation.js'

export interface ListOrdersOptions {
  status?: OrderStatus
  limit?: number
}

/**
 * Cambio de ciclo de vida (T-12) listo para guardar: `next` lo calculó `orderLifecycle` a partir
 * de la fila leída `expected`.
 */
export interface OrderChange {
  /** La escritura solo procede si la fila sigue en esta tienda, versión y estado. */
  expected: Pick<Order, 'id' | 'storeId' | 'version' | 'status'>
  next: Order
  /** Productos usados como sustitutos: deben seguir pedibles en la tienda con esta versión. */
  audit?: import('../audit/orderAudit.js').OrderAuditChanges
  products: { id: string; version: number }[]
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
  /**
   * Escritura condicional atómica (una sentencia): persiste solo los campos mutables de `next`
   * (estado, ítems, `originalItems`, total final, versión, fecha, actor y cancelación). Devuelve
   * `null` si otra escritura cambió la fila o el catálogo después de leerlos; nunca pisa datos.
   */
  saveChange(change: OrderChange): Promise<Order | null>
}
