import type { Order } from '../../domain/orders/Order.js'
import type {
  ListOrdersOptions,
  OrderChange,
  OrdersRepository,
} from '../../domain/orders/OrdersRepository.js'
import {
  matchesOrderFilter,
  toListPosition,
  type OrderListPosition,
  type OrderPage,
  type OrderPageRequest,
} from '../../domain/orders/orderListing.js'
import { ConflictError } from '../../shared/errors.js'
import type { CommitOrderCreation, CommitOrderResult, OrderCreationIdentity, StoredOrderCreation } from '../../domain/orders/orderCreation.js'

const DEFAULT_STORE_LIST_LIMIT = 50

/** Orden del listado: más reciente primero y, a igual fecha, ID mayor primero. Negativo = `a` antes. */
const compareDesc = (a: OrderListPosition, b: OrderListPosition): number =>
  a.createdAt === b.createdAt ? (a.id === b.id ? 0 : a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1

/** Un cambio de ciclo de vida solo aporta campos mutables; el resto se conserva de la fila guardada. */
const keepImmutable = (stored: Order, next: Order): Order => {
  const { customerPhone: _phone, shippingCost: _shipping, ...mutable } = next
  return {
    ...mutable,
    id: stored.id, storeId: stored.storeId, customerId: stored.customerId, customerName: stored.customerName,
    deliveryType: stored.deliveryType, deliveryData: stored.deliveryData,
    substitutionPreference: stored.substitutionPreference, estimatedTotal: stored.estimatedTotal,
    createdAt: stored.createdAt,
    ...(stored.customerPhone !== undefined ? { customerPhone: stored.customerPhone } : {}),
    ...(stored.shippingCost !== undefined ? { shippingCost: stored.shippingCost } : {}),
  }
}

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

  async listPage({ scope, filter, limit, after }: OrderPageRequest): Promise<OrderPage> {
    const matching = [...this.store.values()]
      .filter((order) => matchesOrderFilter(order, scope, filter))
      .map((order) => ({ order, position: toListPosition(order.createdAt, order.id) }))
      .filter(({ position }) => after === undefined || compareDesc(position, after) > 0)
      .sort((a, b) => compareDesc(a.position, b.position))
    return { entries: matching.slice(0, limit), hasMore: matching.length > limit }
  }

  async listByStore(storeId: string, opts?: ListOrdersOptions): Promise<Order[]> {
    const page = await this.listPage({
      scope: { kind: 'store', storeId },
      filter: opts?.status ? { status: opts.status } : {},
      limit: opts?.limit ?? DEFAULT_STORE_LIST_LIMIT,
    })
    return page.entries.map(({ order }) => order)
  }

  /**
   * Compara y escribe sin `await` intermedio: indivisible en este adapter local. Igual que en la
   * creación, no conoce el catálogo: la vigencia de los sustitutos solo la garantiza PostgreSQL.
   */
  async saveChange({ expected, next }: OrderChange): Promise<Order | null> {
    const current = this.store.get(expected.id)
    if (!current || current.storeId !== expected.storeId || current.version !== expected.version ||
      current.status !== expected.status) return null
    const updated = structuredClone(keepImmutable(current, next))
    this.store.set(expected.id, updated)
    return structuredClone(updated)
  }

  reset(): void {
    this.store.clear()
    this.creations.clear()
    this.quotas.clear()
  }
}
