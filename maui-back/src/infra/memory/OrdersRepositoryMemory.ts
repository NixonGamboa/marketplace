import type { Order, OrderStatus } from '../../domain/orders/Order.js'
import type {
  ListOrdersOptions,
  OrdersRepository,
} from '../../domain/orders/OrdersRepository.js'
import { ConflictError, NotFoundError } from '../../shared/errors.js'

export class OrdersRepositoryMemory implements OrdersRepository {
  private readonly store = new Map<string, Order>()

  async create(order: Order): Promise<Order> {
    if (this.store.has(order.id)) {
      throw new ConflictError(`Order ${order.id} already exists`)
    }
    this.store.set(order.id, order)
    return order
  }

  async findById(id: string): Promise<Order | null> {
    return this.store.get(id) ?? null
  }

  async listByStore(storeId: string, opts?: ListOrdersOptions): Promise<Order[]> {
    const all = [...this.store.values()]
      .filter((o) => o.storeId === storeId)
      .filter((o) => (opts?.status ? o.status === opts.status : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return opts?.limit ? all.slice(0, opts.limit) : all
  }

  async updateStatus(id: string, status: OrderStatus, updatedAt: string): Promise<Order> {
    const current = this.store.get(id)
    if (!current) throw new NotFoundError('Order', id)
    const updated: Order = { ...current, status, updatedAt }
    this.store.set(id, updated)
    return updated
  }

  reset(): void {
    this.store.clear()
  }
}
