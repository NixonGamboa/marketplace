import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Order, OrderStatus } from '../../domain/orders/Order.js'
import { orderFromRecord, orderToRecord } from '../../domain/orders/orderRecord.js'
import type {
  ListOrdersOptions,
  OrdersRepository,
} from '../../domain/orders/OrdersRepository.js'
import { NotFoundError } from '../../shared/errors.js'
import type { Db } from './client.js'
import { ordersTable, orderCreationsTable } from './schema.js'
import type { CommitOrderCreation, CommitOrderResult, OrderCreationIdentity, StoredOrderCreation } from '../../domain/orders/orderCreation.js'
import { OrderPersistenceError, decodeCreationOrder } from '../../domain/orders/orderCreation.js'

/** Fallo del driver/SQL o snapshot inválido → `OrderPersistenceError` (503), sin propagar detalles. */
const guardCreation = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch {
    throw new OrderPersistenceError()
  }
}

export class OrdersRepositoryPostgres implements OrdersRepository {
  constructor(private readonly db: Db) {}

  findCreation(identity: OrderCreationIdentity): Promise<StoredOrderCreation | null> {
    return guardCreation(async () => {
      const [row] = await this.db.select().from(orderCreationsTable).where(and(
        eq(orderCreationsTable.customerId, identity.customerId),
        eq(orderCreationsTable.storeId, identity.storeId),
        eq(orderCreationsTable.keyHash, identity.keyHash),
      )).limit(1)
      return row ? { fingerprint: row.fingerprint, order: decodeCreationOrder(row.snapshot) } : null
    })
  }

  createIdempotently(input: CommitOrderCreation): Promise<CommitOrderResult> {
    return guardCreation(() => this.commitCreation(input))
  }

  private async commitCreation(input: CommitOrderCreation): Promise<CommitOrderResult> {
    // Una llamada/una transacción SQL, compatible con Neon HTTP y varias instancias.
    const result = await this.db.execute<{ result: unknown }>(sql`
      SELECT maui_commit_order(
        ${input.customerId}::text, ${input.storeId}::text, ${input.keyHash}::text,
        ${input.fingerprint}::text, ${JSON.stringify(input.order)}::jsonb,
        ${input.storeVersion}::integer, ${JSON.stringify(input.products)}::jsonb,
        ${input.quota.bucket}::text, ${input.quota.limit}::integer, ${input.quota.windowSeconds}::integer
      ) AS result
    `)
    const value = result.rows[0]?.result
    const envelope = z.object({ kind: z.enum(['created', 'replayed', 'conflict', 'changed', 'limited']),
      retryAfterSeconds: z.number().int().positive().optional(),
      creation: z.object({ fingerprint: z.string(), order: z.unknown() }).optional(),
    }).parse(value)
    if (envelope.kind === 'limited') {
      if (!envelope.retryAfterSeconds) throw new Error('Missing rate limit interval')
      return { kind: 'limited', retryAfterSeconds: envelope.retryAfterSeconds }
    }
    if (envelope.kind === 'conflict' || envelope.kind === 'changed') return { kind: envelope.kind }
    // El snapshot lo produce este adapter con el modelo tipado, la misma transacción lo devuelve.
    if (!envelope.creation) throw new Error('Missing creation snapshot')
    return { kind: envelope.kind, creation: { fingerprint: envelope.creation.fingerprint,
      order: decodeCreationOrder(envelope.creation.order) } }
  }

  async create(order: Order): Promise<Order> {
    const [row] = await this.db.insert(ordersTable).values(orderToRecord(order)).returning()
    if (!row) throw new Error('Insert failed')
    return orderFromRecord(row)
  }

  async findById(id: string): Promise<Order | null> {
    const [row] = await this.db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, id))
      .limit(1)
    return row ? orderFromRecord(row) : null
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

    return rows.map(orderFromRecord)
  }

  async updateStatus(id: string, status: OrderStatus, updatedAt: string): Promise<Order> {
    const [row] = await this.db
      .update(ordersTable)
      .set({ status, updatedAt })
      .where(eq(ordersTable.id, id))
      .returning()
    if (!row) throw new NotFoundError('Order', id)
    return orderFromRecord(row)
  }
}
