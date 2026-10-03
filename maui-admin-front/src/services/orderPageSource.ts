import type { AdminOrder } from '@/types/adminOrder'
import type { OrderListFilterInput, OrderPageRequest } from './real/adapters'
import type { RequestOptions } from './realAuthRepository'
import type { OrderRepository } from './mockOrderRepository'
import type { OrderPage } from './realOrderRepository'

/** Fuente paginada de pedidos: en real, una página del servidor; en demo, todo el listado local. */
export interface OrderPageSource {
  loadPage(filter?: OrderListFilterInput, page?: OrderPageRequest, options?: RequestOptions): Promise<OrderPage>
}

/** El demo no pagina: devuelve el listado completo como única página. */
export const demoOrderPageSource = (repository: Pick<OrderRepository, 'list'>): OrderPageSource => ({
  async loadPage(filter) {
    const items: AdminOrder[] = await repository.list(filter)
    return { items, nextCursor: null }
  },
})

export const realOrderPageSource = (repository: { listPage: OrderPageSource['loadPage'] }): OrderPageSource => ({
  loadPage: (filter, page, options) => repository.listPage(filter, page, options),
})
