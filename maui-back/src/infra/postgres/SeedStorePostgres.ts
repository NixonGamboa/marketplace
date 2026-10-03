import { and, eq, inArray, ne, notInArray, or, sql, type SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { PgTable } from 'drizzle-orm/pg-core'
import type {
  AccountRow,
  CategoryRow,
  CreationRow,
  FixtureCounts,
  FixtureScope,
  OrderRow,
  ProductRow,
  ResetBlocker,
  ResetMeasure,
  SeedEraser,
  SeedInspector,
  SeedSchemaStatus,
} from '../../usecases/seed/ports.js'
import type { Db } from './client.js'
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
 * e identidades del dataset: nunca recorre ni modifica el resto de la base. El borrado usa
 * `db.batch` (una transacción en Neon HTTP) y respeta el orden de claves foráneas.
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
    const count = async (table: PgTable, where: SQL | undefined): Promise<number> => {
      const [row] = await this.db.select({ n: sql<string>`count(*)::text` }).from(table).where(where)
      return toNumber(row?.n)
    }
    const toDelete: FixtureCounts = {
      auditEvents: await count(auditEventsTable, conditions.audit),
      orders: await count(ordersTable, conditions.ownOrders),
      orderClaims: await count(orderCreationsTable, conditions.ownClaims),
      sessions: await count(authSessionsTable, conditions.ownSessions),
      accounts: await count(authAccountsTable, conditions.ownAccounts),
      rateLimits: await count(authRateLimitsTable, conditions.rateLimits),
      products: await count(catalogProductsTable, conditions.products),
      categories: await count(catalogCategoriesTable, conditions.categories),
      store: scope.includeStore ? await count(storesTable, eq(storesTable.id, scope.storeId)) : 0,
    }
    const customerIds = scope.accounts.filter(account => account.role === 'customer').map(account => account.id)
    const retainedCustomerOrders = await count(ordersTable, and(
      inArray(ordersTable.customerId, customerIds), notInArray(ordersTable.id, [...scope.orderIds])))

    const candidates: ResetBlocker[] = [
      { kind: 'foreign_order_with_fixture_id', count: await count(ordersTable, and(inArray(ordersTable.id, [...scope.orderIds]), sql`not (${conditions.ownOrders})`)) },
      { kind: 'foreign_product_with_fixture_id', count: await count(catalogProductsTable, and(inArray(catalogProductsTable.id, [...scope.productIds]), ne(catalogProductsTable.storeId, scope.storeId))) },
      { kind: 'foreign_category_with_fixture_id', count: await count(catalogCategoriesTable, and(inArray(catalogCategoriesTable.id, [...scope.categoryIds]), ne(catalogCategoriesTable.storeId, scope.storeId))) },
      { kind: 'foreign_account_with_fixture_id', count: await count(authAccountsTable, and(inArray(authAccountsTable.id, scope.accounts.map(account => account.id)), sql`not (${conditions.ownAccounts})`)) },
      { kind: 'foreign_product_in_fixture_category', count: await count(catalogProductsTable, and(
        eq(catalogProductsTable.storeId, scope.storeId), inArray(catalogProductsTable.categoryId, [...scope.categoryIds]),
        notInArray(catalogProductsTable.id, [...scope.productIds]))) },
    ]
    if (scope.includeStore) {
      const foreignInStore = (await count(catalogCategoriesTable, and(eq(catalogCategoriesTable.storeId, scope.storeId), notInArray(catalogCategoriesTable.id, [...scope.categoryIds]))))
        + (await count(catalogProductsTable, and(eq(catalogProductsTable.storeId, scope.storeId), notInArray(catalogProductsTable.id, [...scope.productIds]))))
        + (await count(authAccountsTable, and(eq(authAccountsTable.storeId, scope.storeId), notInArray(authAccountsTable.id, scope.accounts.map(account => account.id)))))
      candidates.push({ kind: 'store_has_foreign_dependents', count: foreignInStore })
    }
    return { toDelete, retainedCustomerOrders, blockers: candidates.filter(blocker => blocker.count > 0) }
  }

  async erase(scope: FixtureScope): Promise<void> {
    const conditions = this.conditions(scope)
    const statements: BatchItem<'pg'>[] = [
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
    if (first) await this.db.batch([first, ...rest])
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
