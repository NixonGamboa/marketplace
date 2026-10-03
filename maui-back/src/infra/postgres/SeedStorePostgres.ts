import { and, eq, inArray, ne, notInArray, or, sql, type SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { PgTable } from 'drizzle-orm/pg-core'
import type {
  AccountRow,
  CategoryRow,
  CreationRow,
  FixtureScope,
  OrderRow,
  ProductRow,
  ResetMeasure,
  SeedEraser,
  SeedInspector,
  SeedSchemaStatus,
} from '../../usecases/seed/ports.js'
import type { Db } from './client.js'
import { ResetRejectedError } from '../../usecases/seed/resetFixtures.js'
import {
  auditEventsTable,
  authAccountsTable,
  authRateLimitsTable,
  authSessionsTable,
  catalogCategoriesTable,
  catalogProductsTable,
  orderCreationsTable,
  ordersTable,
  storesTable,
} from './schema.js'

/** Tablas que el seed necesita: si alguna falta, las migraciones no se aplicaron. */
const REQUIRED_TABLES: readonly [string, PgTable][] = [
  ['orders', ordersTable],
  ['order_creations', orderCreationsTable],
  ['auth_accounts', authAccountsTable],
  ['auth_sessions', authSessionsTable],
  ['auth_rate_limits', authRateLimitsTable],
  ['stores', storesTable],
  ['catalog_categories', catalogCategoriesTable],
  ['catalog_products', catalogProductsTable],
  ['audit_events', auditEventsTable],
]

/** Función SQL de la creación auditada de pedidos (migración 0007). */
const ORDER_COMMIT_FUNCTION = 'maui_commit_order_audited'

const toNumber = (value: string | number | undefined): number => Number(value ?? 0)

/**
 * Lecturas del preflight y borrado acotado de fixtures sobre Postgres (T-16). Solo consulta por IDs
 * e identidades del dataset y sus dependientes. El borrado usa `db.batch` (una transacción
 * en Neon HTTP), bloquea escrituras y verifica el snapshot antes de cualquier efecto.
 */
export class SeedStorePostgres implements SeedInspector, SeedEraser {
  constructor(private readonly db: Db) {}

  async databaseName(): Promise<string> {
    const result = await this.db.execute<{ name: string }>(sql`select current_database() as name`)
    return String(result.rows[0]?.name ?? '')
  }

  async schemaStatus(): Promise<SeedSchemaStatus> {
    const missing: string[] = []
    for (const [name, table] of REQUIRED_TABLES) {
      try {
        await this.db.select({ n: sql<string>`1` }).from(table).limit(1)
      } catch {
        missing.push(name)
      }
    }
    const fn = await this.db.execute<{ n: string }>(
      sql`select count(*)::text as n from pg_proc where proname = ${ORDER_COMMIT_FUNCTION}`)
    if (toNumber(fn.rows[0]?.n) === 0) missing.push(ORDER_COMMIT_FUNCTION)

    let ledgerEntries: number | null = null
    try {
      const ledger = await this.db.execute<{ n: string }>(sql`select count(*)::text as n from drizzle.__drizzle_migrations`)
      ledgerEntries = toNumber(ledger.rows[0]?.n)
    } catch {
      ledgerEntries = null
    }
    return { missing, ledgerEntries }
  }

  async hasStore(storeId: string): Promise<boolean> {
    const rows = await this.db.select({ id: storesTable.id }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1)
    return rows.length > 0
  }

  findCategories(storeId: string, ids: readonly string[], slugs: readonly string[]): Promise<CategoryRow[]> {
    return this.db
      .select({ id: catalogCategoriesTable.id, storeId: catalogCategoriesTable.storeId, slug: catalogCategoriesTable.slug })
      .from(catalogCategoriesTable)
      .where(or(
        inArray(catalogCategoriesTable.id, [...ids]),
        and(eq(catalogCategoriesTable.storeId, storeId), inArray(catalogCategoriesTable.slug, [...slugs])),
      ))
  }

  findProducts(ids: readonly string[]): Promise<ProductRow[]> {
    return this.db
      .select({ id: catalogProductsTable.id, storeId: catalogProductsTable.storeId, categoryId: catalogProductsTable.categoryId })
      .from(catalogProductsTable)
      .where(inArray(catalogProductsTable.id, [...ids]))
  }

  findAccounts({ ids, emails, phones }: { ids: readonly string[]; emails: readonly string[]; phones: readonly string[] }): Promise<AccountRow[]> {
    return this.db
      .select({
        id: authAccountsTable.id, role: authAccountsTable.role, email: authAccountsTable.email,
        phone: authAccountsTable.phone, storeId: authAccountsTable.storeId, status: authAccountsTable.status,
      })
      .from(authAccountsTable)
      .where(or(
        inArray(authAccountsTable.id, [...ids]),
        inArray(authAccountsTable.email, [...emails]),
        inArray(authAccountsTable.phone, [...phones]),
      ))
  }

  findOrders(ids: readonly string[]): Promise<OrderRow[]> {
    return this.db
      .select({ id: ordersTable.id, storeId: ordersTable.storeId, customerId: ordersTable.customerId })
      .from(ordersTable)
      .where(inArray(ordersTable.id, [...ids]))
  }

  findCreations(orderIds: readonly string[], keyHashes: readonly string[]): Promise<CreationRow[]> {
    return this.db
      .select({
        orderId: orderCreationsTable.orderId, customerId: orderCreationsTable.customerId, storeId: orderCreationsTable.storeId,
        keyHash: orderCreationsTable.keyHash, fingerprint: orderCreationsTable.fingerprint,
      })
      .from(orderCreationsTable)
      .where(or(inArray(orderCreationsTable.orderId, [...orderIds]), inArray(orderCreationsTable.keyHash, [...keyHashes])))
  }

  async measure(scope: FixtureScope): Promise<ResetMeasure> {
    const conditions = this.conditions(scope)
    const count = (table: PgTable, where: SQL | undefined): SQL =>
      sql`(select count(*) from ${table} where ${where ?? sql`true`})`
    const toDelete = sql`jsonb_build_object(
      'auditEvents', ${count(auditEventsTable, conditions.audit)},
      'orders', ${count(ordersTable, conditions.ownOrders)},
      'orderClaims', ${count(orderCreationsTable, conditions.ownClaims)},
      'sessions', ${count(authSessionsTable, conditions.ownSessions)},
      'accounts', ${count(authAccountsTable, conditions.ownAccounts)},
      'rateLimits', ${count(authRateLimitsTable, conditions.rateLimits)},
      'products', ${count(catalogProductsTable, conditions.products)},
      'categories', ${count(catalogCategoriesTable, conditions.categories)},
      'store', ${scope.includeStore ? count(storesTable, eq(storesTable.id, scope.storeId)) : sql`0`})`
    const customerIds = scope.accounts.filter(account => account.role === 'customer').map(account => account.id)
    const retainedCustomerOrders = count(ordersTable, and(
      inArray(ordersTable.customerId, customerIds), notInArray(ordersTable.id, [...scope.orderIds])))

    const candidates: { kind: string; count: SQL }[] = [
      { kind: 'retained_customer_orders', count: retainedCustomerOrders },
      { kind: 'foreign_order_with_fixture_id', count: count(ordersTable, and(inArray(ordersTable.id, [...scope.orderIds]), sql`not (${conditions.ownOrders})`)) },
      { kind: 'foreign_product_with_fixture_id', count: count(catalogProductsTable, and(inArray(catalogProductsTable.id, [...scope.productIds]), ne(catalogProductsTable.storeId, scope.storeId))) },
      { kind: 'foreign_category_with_fixture_id', count: count(catalogCategoriesTable, and(inArray(catalogCategoriesTable.id, [...scope.categoryIds]), ne(catalogCategoriesTable.storeId, scope.storeId))) },
      { kind: 'foreign_account_with_fixture_id', count: count(authAccountsTable, and(inArray(authAccountsTable.id, scope.accounts.map(account => account.id)), sql`not (${conditions.ownAccounts})`)) },
      { kind: 'foreign_product_in_fixture_category', count: count(catalogProductsTable, and(
        eq(catalogProductsTable.storeId, scope.storeId), inArray(catalogProductsTable.categoryId, [...scope.categoryIds]),
        notInArray(catalogProductsTable.id, [...scope.productIds]))) },
    ]
    if (scope.includeStore) {
      const foreignInStore = sql`(
        ${count(catalogCategoriesTable, and(eq(catalogCategoriesTable.storeId, scope.storeId), notInArray(catalogCategoriesTable.id, [...scope.categoryIds])))}
        + ${count(catalogProductsTable, and(eq(catalogProductsTable.storeId, scope.storeId), notInArray(catalogProductsTable.id, [...scope.productIds])))}
        + ${count(authAccountsTable, and(eq(authAccountsTable.storeId, scope.storeId), sql`not (${conditions.ownAccounts})`))}
        + ${count(ordersTable, and(eq(ordersTable.storeId, scope.storeId), sql`not (${conditions.ownOrders})`))}
        + ${count(orderCreationsTable, and(eq(orderCreationsTable.storeId, scope.storeId), sql`not (${conditions.ownClaims})`))}
        + ${count(auditEventsTable, and(eq(auditEventsTable.storeId, scope.storeId), sql`not (${conditions.audit})`))})`
      candidates.push({ kind: 'store_has_foreign_dependents', count: foreignInStore })
    }
    // Una sentencia: conteos, bloqueos y contenido comparten el mismo snapshot MVCC.
    const blockers = sql`(select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'count', n) order by ordinal), '[]'::jsonb)
      from (values ${sql.join(candidates.map((candidate, index) => sql`(${index}, ${candidate.kind}::text, ${candidate.count})`), sql`, `)}) b(ordinal, kind, n)
      where n > 0)`
    const result = await this.db.execute<{ measure: ResetMeasure }>(sql`select jsonb_build_object(
      'toDelete', ${toDelete}, 'retainedCustomerOrders', ${retainedCustomerOrders},
      'blockers', ${blockers}, 'stateFingerprint', ${this.stateFingerprint(scope)}) as measure`)
    const measure = result.rows[0]?.measure
    if (!measure) throw new Error('No se pudo medir el estado del reset')
    return measure
  }

  async erase(scope: FixtureScope, expectedFingerprint: string): Promise<void> {
    const conditions = this.conditions(scope)
    const statements: BatchItem<'pg'>[] = [
      // Orden fijo; SHARE ROW EXCLUSIVE impide INSERT/UPDATE/DELETE hasta commit o rollback.
      this.db.execute(sql`lock table audit_events, auth_accounts, auth_rate_limits, auth_sessions,
        catalog_categories, catalog_products, order_creations, orders, stores in share row exclusive mode`),
      // El divisor depende del snapshot: no permite constant folding y aborta toda la transacción.
      this.db.execute(sql`select 1 / case when ${this.stateFingerprint(scope)} = ${expectedFingerprint} then 1 else 0 end as reset_snapshot_guard`),
      this.db.delete(auditEventsTable).where(conditions.audit),
      // Los claims de idempotencia caen en cascada con su pedido.
      this.db.delete(ordersTable).where(conditions.ownOrders),
      this.db.delete(authRateLimitsTable).where(conditions.rateLimits),
      // Las sesiones caen en cascada con su cuenta.
      this.db.delete(authAccountsTable).where(conditions.ownAccounts),
      this.db.delete(catalogProductsTable).where(conditions.products),
      this.db.delete(catalogCategoriesTable).where(conditions.categories),
      ...(scope.includeStore ? [this.db.delete(storesTable).where(eq(storesTable.id, scope.storeId))] : []),
    ]
    const [first, ...rest] = statements
    try {
      if (first) await this.db.batch([first, ...rest])
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '22012') {
        throw new ResetRejectedError('STATE_CHANGED')
      }
      throw error
    }
  }

  /** Huella server-side: ninguna fila, PII ni credencial sale de Postgres. */
  private stateFingerprint(scope: FixtureScope): SQL {
    const accountIds = scope.accounts.map(account => account.id)
    const customerIds = scope.accounts.filter(account => account.role === 'customer').map(account => account.id)
    const accounts = or(
      inArray(authAccountsTable.id, accountIds), eq(authAccountsTable.storeId, scope.storeId),
      inArray(authAccountsTable.email, scope.accounts.flatMap(account => account.email ? [account.email] : [])),
      inArray(authAccountsTable.phone, scope.accounts.flatMap(account => account.phone ? [account.phone] : [])),
    )
    const relevant: readonly [string, PgTable, SQL | undefined][] = [
      ['store', storesTable, eq(storesTable.id, scope.storeId)],
      ['categories', catalogCategoriesTable, or(eq(catalogCategoriesTable.storeId, scope.storeId), inArray(catalogCategoriesTable.id, [...scope.categoryIds]))],
      ['products', catalogProductsTable, or(eq(catalogProductsTable.storeId, scope.storeId), inArray(catalogProductsTable.id, [...scope.productIds]), inArray(catalogProductsTable.categoryId, [...scope.categoryIds]))],
      ['accounts', authAccountsTable, accounts],
      ['sessions', authSessionsTable, sql`${authSessionsTable.accountId} in (select ${authAccountsTable.id} from ${authAccountsTable} where ${accounts})`],
      ['rateLimits', authRateLimitsTable, inArray(authRateLimitsTable.bucket, [...scope.rateLimitBuckets])],
      ['orders', ordersTable, or(eq(ordersTable.storeId, scope.storeId), inArray(ordersTable.id, [...scope.orderIds]), inArray(ordersTable.customerId, customerIds))],
      ['claims', orderCreationsTable, or(eq(orderCreationsTable.storeId, scope.storeId), inArray(orderCreationsTable.orderId, [...scope.orderIds]), inArray(orderCreationsTable.customerId, customerIds))],
      ['audit', auditEventsTable, or(eq(auditEventsTable.storeId, scope.storeId), this.conditions(scope).audit)],
    ]
    const rows = relevant.map(([name, table, where]) => sql`${name}::text,
      (select coalesce(jsonb_agg(row_data order by row_data::text), '[]'::jsonb)
        from (select to_jsonb(${table}) as row_data from ${table} where ${where ?? sql`true`}) snapshot_rows)`)
    return sql`encode(sha256(convert_to(jsonb_build_object(${sql.join(rows, sql`, `)})::text, 'UTF8')), 'hex')`
  }

  /** Condiciones de alcance: por ID Y por identidad/tienda esperadas, nunca solo por ID. */
  private conditions(scope: FixtureScope) {
    const customerIds = scope.accounts.filter(account => account.role === 'customer').map(account => account.id)
    const own = (account: FixtureScope['accounts'][number]): SQL | undefined => and(
      eq(authAccountsTable.id, account.id),
      eq(authAccountsTable.role, account.role),
      account.email === null ? sql`${authAccountsTable.email} is null` : eq(authAccountsTable.email, account.email),
      account.phone === null ? sql`${authAccountsTable.phone} is null` : eq(authAccountsTable.phone, account.phone),
      account.storeId === null ? sql`${authAccountsTable.storeId} is null` : eq(authAccountsTable.storeId, account.storeId),
    )
    const ownAccounts = or(...scope.accounts.map(own)) as SQL
    const ownOrders = and(
      inArray(ordersTable.id, [...scope.orderIds]),
      eq(ordersTable.storeId, scope.storeId),
      inArray(ordersTable.customerId, customerIds),
      sql`exists (select 1 from order_creations c where c.order_id = ${ordersTable.id}
        and c.customer_id = ${ordersTable.customerId} and c.store_id = ${ordersTable.storeId})`,
    ) as SQL
    const entityEvents = (entity: string, ids: readonly string[]): SQL | undefined =>
      and(eq(auditEventsTable.entity, entity), inArray(auditEventsTable.entityId, [...ids]))
    return {
      ownAccounts,
      ownOrders,
      ownClaims: and(
        inArray(orderCreationsTable.orderId, [...scope.orderIds]),
        eq(orderCreationsTable.storeId, scope.storeId),
        inArray(orderCreationsTable.customerId, customerIds),
      ),
      ownSessions: sql`${authSessionsTable.accountId} in (select ${authAccountsTable.id} from ${authAccountsTable} where ${ownAccounts})`,
      rateLimits: inArray(authRateLimitsTable.bucket, [...scope.rateLimitBuckets]),
      products: and(eq(catalogProductsTable.storeId, scope.storeId), inArray(catalogProductsTable.id, [...scope.productIds])),
      categories: and(eq(catalogCategoriesTable.storeId, scope.storeId), inArray(catalogCategoriesTable.id, [...scope.categoryIds])),
      audit: and(
        eq(auditEventsTable.storeId, scope.storeId),
        or(
          entityEvents('order', scope.orderIds),
          entityEvents('product', scope.productIds),
          entityEvents('category', scope.categoryIds),
          scope.includeStore ? entityEvents('store', [scope.storeId]) : undefined,
        ),
      ),
    }
  }
}
