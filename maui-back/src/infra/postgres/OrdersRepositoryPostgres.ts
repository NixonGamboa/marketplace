import { and, eq, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { Order } from '../../domain/orders/Order.js'
import { orderFromRecord, orderToRecord } from '../../domain/orders/orderRecord.js'
import type {
  ListOrdersOptions,
  OrderChange,
  OrdersRepository,
} from '../../domain/orders/OrdersRepository.js'
import {
  phoneDigitsFromSearch,
  type OrderListFilter,
  type OrderListScope,
  type OrderPage,
  type OrderPageRequest,
} from '../../domain/orders/orderListing.js'
import type { Db } from './client.js'
import { catalogProductsTable, ordersTable, orderCreationsTable } from './schema.js'
import type { CommitOrderCreation, CommitOrderResult, OrderCreationIdentity, StoredOrderCreation } from '../../domain/orders/orderCreation.js'
import { OrderPersistenceError, decodeCreationOrder } from '../../domain/orders/orderCreation.js'

/** Fallo del driver/SQL o snapshot inválido → `OrderPersistenceError` (503), sin propagar detalles (creación, listado y cambios). */
const guardPersistence = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch {
    throw new OrderPersistenceError()
  }
}

const DEFAULT_STORE_LIST_LIMIT = 50

/** Mismo orden que los índices `orders_by_*_recent` (DESC NULLS LAST) para que PostgreSQL no ordene aparte. */
const LIST_ORDER = [sql`${ordersTable.createdAt} desc nulls last`, sql`${ordersTable.id} desc nulls last`]

/**
 * Posición del cursor calculada por PostgreSQL con los 6 decimales de la columna. Leer la fecha
 * por el driver la redondea a milisegundos, y un cursor así saltaría o repetiría filas del borde.
 */
const listPositionSql = sql<string>`to_char(${ordersTable.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

/**
 * Alcance y filtros del listado. Todo valor viaja como parámetro; la búsqueda usa `strpos` sobre
 * texto literal (sin LIKE ni regex del usuario): `%`, `_` y `\` no son comodines.
 */
const listConditions = (scope: OrderListScope, filter: OrderListFilter): SQL[] => {
  const conditions: SQL[] = [
    scope.kind === 'customer' ? eq(ordersTable.customerId, scope.customerId) : eq(ordersTable.storeId, scope.storeId),
  ]
  if (filter.status !== undefined) conditions.push(eq(ordersTable.status, filter.status))
  if (filter.from !== undefined) conditions.push(sql`${ordersTable.createdAt} >= ${filter.from}::timestamptz`)
  if (filter.to !== undefined) conditions.push(sql`${ordersTable.createdAt} < ${filter.to}::timestamptz`)
  if (filter.search !== undefined) {
    const needle = sql`lower(${filter.search}::text)`
    const digits = phoneDigitsFromSearch(filter.search)
    const search = or(
      sql`strpos(lower(${ordersTable.id}), ${needle}) = 1`,
      sql`strpos(lower(${ordersTable.customerName}), ${needle}) > 0`,
      digits === null
        ? undefined
        : sql`strpos(regexp_replace(${ordersTable.customerPhone}, '[^0-9]', '', 'g'), ${digits}::text) > 0`,
    )
    if (search) conditions.push(search)
  }
  return conditions
}

/**
 * Condición del UPDATE de un cambio con sustitutos: bloquea con `FOR SHARE` (orden estable por ID)
 * las filas de catálogo de los sustitutos y exige que todas sigan en la tienda, con la versión
 * leída, activas, sin archivar y con stock. Bajo READ COMMITTED, si otra transacción cambió el
 * producto, el bloqueo espera a que confirme y reevalúa la condición sobre la fila nueva (la
 * versión ya no coincide → sin escritura → 409). Mientras el pedido se escribe, un cambio de
 * catálogo espera a que termine la sentencia. Los bloqueos duran solo esta sentencia.
 */
const substitutesLocked = (storeId: string, products: { id: string; version: number }[]): SQL => sql`(
  select count(*) from (
    select 1 from ${catalogProductsTable} as p
    join jsonb_to_recordset(${JSON.stringify(products)}::jsonb) as expected(id text, version integer)
      on p.id = expected.id and p.version = expected.version
    where p.store_id = ${storeId} and p.active and p.archived_at is null and p.in_stock
    order by p.id
    for share of p
  ) as locked
) = ${products.length}`

export class OrdersRepositoryPostgres implements OrdersRepository {
  constructor(private readonly db: Db) {}

  findCreation(identity: OrderCreationIdentity): Promise<StoredOrderCreation | null> {
    return guardPersistence(async () => {
      const [row] = await this.db.select().from(orderCreationsTable).where(and(
        eq(orderCreationsTable.customerId, identity.customerId),
        eq(orderCreationsTable.storeId, identity.storeId),
        eq(orderCreationsTable.keyHash, identity.keyHash),
      )).limit(1)
      return row ? { fingerprint: row.fingerprint, order: decodeCreationOrder(row.snapshot) } : null
    })
  }

  createIdempotently(input: CommitOrderCreation): Promise<CommitOrderResult> {
    return guardPersistence(() => this.commitCreation(input))
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

  async listPage({ scope, filter, limit, after }: OrderPageRequest): Promise<OrderPage> {
    const conditions = listConditions(scope, filter)
    if (after) {
      const createdAt = sql`${after.createdAt}::timestamptz`
      const keyset = or(
        sql`${ordersTable.createdAt} < ${createdAt}`,
        and(sql`${ordersTable.createdAt} = ${createdAt}`, sql`${ordersTable.id} < ${after.id}::text`),
      )
      if (keyset) conditions.push(keyset)
    }
    // Solo el acceso al driver se traduce a 503; un pedido persistido inválido sigue siendo un error interno.
    // `limit + 1` detecta la página siguiente sin COUNT ni cargar el resto.
    const rows = await guardPersistence(() => this.db
      .select({ record: ordersTable, position: listPositionSql })
      .from(ordersTable)
      .where(and(...conditions))
      .orderBy(...LIST_ORDER)
      .limit(limit + 1))

    return {
      entries: rows.slice(0, limit).map(({ record, position }) => ({
        order: orderFromRecord(record),
        position: { createdAt: position, id: record.id },
      })),
      hasMore: rows.length > limit,
    }
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
   * UPDATE condicional en una sola sentencia (compatible con Neon HTTP y varias instancias): la
   * fila debe seguir en la tienda, versión y estado leídos. Dos cambios concurrentes sobre la misma
   * versión: uno escribe y el otro recibe `null`. Solo se escriben columnas mutables; estimación,
   * envío, cliente y entrega no se tocan. Con sustitutos, la misma sentencia los bloquea (ver
   * `substitutesLocked`), así el pedido nunca confirma un snapshot de catálogo obsoleto.
   */
  saveChange({ expected, next, products }: OrderChange): Promise<Order | null> {
    return guardPersistence(async () => {
      const [row] = await this.db
        .update(ordersTable)
        .set({
          status: next.status,
          items: next.items,
          originalItems: next.originalItems ?? null,
          itemAdjustments: next.itemAdjustments ?? null,
          finalTotal: next.finalTotal ?? null,
          version: next.version,
          updatedAt: next.updatedAt,
          updatedBy: next.updatedBy ?? null,
          cancellationReason: next.cancellationReason ?? null,
          cancelledAt: next.cancelledAt ?? null,
        })
        .where(and(
          eq(ordersTable.id, expected.id),
          eq(ordersTable.storeId, expected.storeId),
          eq(ordersTable.version, expected.version),
          eq(ordersTable.status, expected.status),
          ...(products.length > 0 ? [substitutesLocked(expected.storeId, products)] : []),
        ))
        .returning()
      return row ? orderFromRecord(row) : null
    })
  }
}
