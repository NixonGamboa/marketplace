import type { Order, OrderStatus } from '../../domain/orders/Order.js'
import type {
  ListOrdersOptions,
  OrdersRepository,
} from '../../domain/orders/OrdersRepository.js'
import { ConflictError, NotFoundError } from '../../shared/errors.js'
import type { CommitOrderCreation, CommitOrderResult, OrderCreationIdentity, StoredOrderCreation } from '../../domain/orders/orderCreation.js'

export class OrdersRepositoryMemory implements OrdersRepository {
  private readonly store = new Map<string, Order>()
  private readonly creations = new Map<string, StoredOrderCreation>()
  private readonly quotas = new Map<string, { start: number; count: number }>()

  private creationKey(identity: OrderCreationIdentity): string {
    return JSON.stringify([identity.customerId, identity.storeId, identity.keyHash])
  }

  async findCreation(identity: OrderCreationIdentity): Promise<StoredOrderCreation | null> {
    const creation = this.creations.get(this.creationKey(identity))
    return creation ? structuredClone(creation) : null
  }

  async createIdempotently(input: CommitOrderCreation): Promise<CommitOrderResult> {
    // Sin await entre lectura y escritura: una operación indivisible en este adapter local.
    const key = this.creationKey(input)
    const prior = this.creations.get(key)
    if (prior) return prior.fingerprint === input.fingerprint
      ? { kind: 'replayed', creation: structuredClone(prior) } : { kind: 'conflict' }
    if (this.store.has(input.order.id)) throw new ConflictError('Order already exists')
    const now = Date.parse(input.order.createdAt)
    const current = this.quotas.get(input.quota.bucket)
    const quota = current && current.start + input.quota.windowSeconds * 1000 > now
      ? current : { start: now, count: 0 }
    if (quota.count >= input.quota.limit) return {
      kind: 'limited', retryAfterSeconds: Math.max(1, Math.ceil((quota.start + input.quota.windowSeconds * 1000 - now) / 1000)),
    }
    const creation = { fingerprint: input.fingerprint, order: structuredClone(input.order) }
    this.store.set(input.order.id, structuredClone(input.order))
    this.creations.set(key, creation)
    this.quotas.set(input.quota.bucket, { ...quota, count: quota.count + 1 })
    return { kind: 'created', creation: structuredClone(creation) }
  }

  resetCreationQuotas(): void { this.quotas.clear() }

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
    this.creations.clear()
    this.quotas.clear()
  }
}
