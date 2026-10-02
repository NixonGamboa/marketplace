import type { ListOrdersQuery } from '../../../../shared/contracts/index.js'
import type { Order } from '../../domain/orders/Order.js'
import { listScopeFor, type OrderActor } from '../../domain/orders/orderAccess.js'
import type { OrderListFilter } from '../../domain/orders/orderListing.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import { decodeOrderListCursor, encodeOrderListCursor, orderListBinding } from './orderListCursor.js'

export interface OrderListResult {
  items: Order[]
  nextCursor: string | null
}

/**
 * Listado histórico autorizado. El alcance sale del actor (cuenta vigente), nunca de la query:
 * cliente → sus pedidos; owner/operator → los de su tienda. Un cursor ajeno a esta consulta
 * (otros filtros, cuenta, rol o tienda) es un error de validación.
 */
export const listOrdersForActor = async (
  deps: { orders: Pick<OrdersRepository, 'listPage'> },
  actor: OrderActor,
  query: ListOrdersQuery,
): Promise<OrderListResult> => {
  const scope = listScopeFor(actor)
  const filter: OrderListFilter = {
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.from !== undefined ? { from: query.from } : {}),
    ...(query.to !== undefined ? { to: query.to } : {}),
    ...(query.q !== undefined ? { search: query.q } : {}),
  }
  const binding = orderListBinding(actor, scope, filter)
  const after = query.cursor === undefined ? undefined : decodeOrderListCursor(query.cursor, binding)

  const page = await deps.orders.listPage({ scope, filter, limit: query.limit, ...(after ? { after } : {}) })
  const last = page.entries.at(-1)
  return {
    items: page.entries.map(({ order }) => order),
    nextCursor: page.hasMore && last ? encodeOrderListCursor(last.position, binding) : null,
  }
}
