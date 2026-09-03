import { and, desc, eq, lt } from 'drizzle-orm'
import type { Order, OrderStatus } from '../../domain/orders/Order.js'
import type {
  ListOrdersOptions,
  OrdersRepository,
} from '../../domain/orders/OrdersRepository.js'
import { NotFoundError } from '../../shared/errors.js'
import type { Db } from './client.js'
import { ordersTable } from './schema.js'

export class OrdersRepositoryPostgres implements OrdersRepository {
  constructor(private readonly db: Db) {}

  async create(order: Order): Promise<Order> {
    const [row] = await this.db
      .insert(ordersTable)
      .values({ ...order, deliveryAddress: order.deliveryAddress ?? null })
      .returning()
    if (!row) throw new Error('Insert failed')
    return this.rowToOrder(row)
  }

  async findById(id: string): Promise<Order | null> {
    const [row] = await this.db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, id))
      .limit(1)
    return row ? this.rowToOrder(row) : null
  }

  async listByStore(storeId: string, opts?: ListOrdersOptions): Promise<Order[]> {
    const conditions = [eq(ordersTable.storeId, storeId)]
    if (opts?.status) conditions.push(eq(ordersTable.status, opts.status))
    if (opts?.cursor) conditions.push(lt(ordersTable.createdAt, opts.cursor))

    const rows = await this.db
      .select()
      .from(ordersTable)
      .where(and(...conditions))
      .orderBy(desc(ordersTable.createdAt))
      .limit(opts?.limit ?? 50)

    return rows.map((r) => this.rowToOrder(r))
  }

  async updateStatus(id: string, status: OrderStatus, updatedAt: string): Promise<Order> {
    const [row] = await this.db
      .update(ordersTable)
      .set({ status, updatedAt })
      .where(eq(ordersTable.id, id))
      .returning()
    if (!row) throw new NotFoundError('Order', id)
    return this.rowToOrder(row)
  }

  private rowToOrder(row: typeof ordersTable.$inferSelect): Order {
    return {
      id: row.id,
      storeId: row.storeId,
      customerId: row.customerId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      items: row.items,
      total: row.total,
      status: row.status as OrderStatus,
      deliveryMode: row.deliveryMode as Order['deliveryMode'],
      substitutionPreference: row.substitutionPreference as Order['substitutionPreference'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.deliveryAddress !== null ? { deliveryAddress: row.deliveryAddress } : {}),
    }
  }
}
