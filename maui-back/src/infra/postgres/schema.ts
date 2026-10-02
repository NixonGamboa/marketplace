import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type {
  NutritionalInfoDto,
  TimeSlotConfigDto,
  WeeklyScheduleDto,
} from '../../../../shared/contracts/index.js'
import type { StoredOrderItem } from '../../domain/orders/orderRecord.js'

export const ordersTable = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    storeId: text('store_id').notNull(),
    customerId: text('customer_id').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    items: jsonb('items').$type<StoredOrderItem[]>().notNull(),
    /** Estimación original (ítems + envío). En filas legacy solo ítems. */
    total: integer('total').notNull(),
    status: text('status').notNull(),
    deliveryMode: text('delivery_mode').notNull(),
    deliveryAddress: text('delivery_address'),
    substitutionPreference: text('substitution_preference').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
    // Añadidas en 0001 (T-04). NULL = pedido legacy sin el dato.
    shippingCost: integer('shipping_cost'),
    finalTotal: integer('final_total'),
    deliveryLat: doublePrecision('delivery_lat'),
    deliveryLng: doublePrecision('delivery_lng'),
    deliveryTimeSlot: text('delivery_time_slot'),
  },
  (t) => ({
    byStoreStatus: index('orders_by_store_status').on(t.storeId, t.status, t.createdAt),
  }),
)

/**
 * Cuentas (T-05). Cliente: `phone` único (contacto no verificado), sin email ni tienda.
 * Staff: `email` único en minúsculas y `store_id` fijado por el servidor, sin phone.
 * Los CHECK hacen cumplir esa forma aunque se inserte fuera del código de la aplicación.
 */
export const authAccountsTable = pgTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    role: text('role').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    storeId: text('store_id'),
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => ({
    phoneUnique: uniqueIndex('auth_accounts_phone_unique').on(t.phone),
    emailUnique: uniqueIndex('auth_accounts_email_unique').on(t.email),
    statusValid: check('auth_accounts_status_valid', sql`${t.status} in ('active', 'disabled')`),
    identityShape: check(
      'auth_accounts_identity_shape',
      sql`(${t.role} = 'customer' and ${t.phone} is not null and ${t.email} is null and ${t.storeId} is null)
        or (${t.role} in ('owner', 'operator') and ${t.email} is not null and ${t.email} = lower(${t.email}) and ${t.storeId} is not null and ${t.phone} is null)`,
    ),
  }),
)

/** Sesiones revocables. `id` es el `jti` del JWT (aleatorio, 256 bits). */
export const authSessionsTable = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => authAccountsTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => ({
    byAccount: index('auth_sessions_by_account').on(t.accountId),
  }),
)

/** Ventana fija por bucket opaco (HMAC del identificador). Se reserva con un upsert atómico. */
export const authRateLimitsTable = pgTable('auth_rate_limits', {
  bucket: text('bucket').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true, mode: 'string' }).notNull(),
  attempts: integer('attempts').notNull(),
})

/**
 * Configuración de tienda (T-08). Horario y franjas en JSONB validado con el contrato al leer.
 * Los CHECK repiten las invariantes del contrato para escrituras fuera de la aplicación.
 * `orders.store_id` y `auth_accounts.store_id` no se vinculan: filas previas se conservan.
 */
export const storesTable = pgTable(
  'stores',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    contactPhone: text('contact_phone'),
    address: text('address').notNull(),
    timeZone: text('time_zone').notNull(),
    weeklySchedule: jsonb('weekly_schedule').$type<WeeklyScheduleDto>().notNull(),
    scheduleOverride: text('schedule_override').notNull(),
    deliveryEnabled: boolean('delivery_enabled').notNull(),
    shippingCost: integer('shipping_cost').notNull(),
    freeShippingThreshold: integer('free_shipping_threshold'),
    deliveryCutoff: text('delivery_cutoff'),
    coverageNote: text('coverage_note'),
    timeSlots: jsonb('time_slots').$type<TimeSlotConfigDto[]>().notNull(),
    version: integer('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => ({
    timeZoneValid: check('stores_time_zone_valid', sql`${t.timeZone} = 'America/Bogota'`),
    overrideValid: check('stores_schedule_override_valid', sql`${t.scheduleOverride} in ('auto', 'open', 'closed')`),
    amountsValid: check(
      'stores_delivery_amounts_valid',
      sql`${t.shippingCost} between 0 and 100000000 and (${t.freeShippingThreshold} is null or ${t.freeShippingThreshold} between 1 and 100000000)`,
    ),
    contactValid: check(
      'stores_contact_phone_valid',
      sql`${t.contactPhone} is null or (${t.contactPhone} ~ '^573[0-9]{9}$' and ${t.contactPhone} <> '573000000000')`,
    ),
    versionValid: check('stores_version_positive', sql`${t.version} >= 1`),
  }),
)

/** Categorías (pasillos) por tienda (T-07). `(store_id, id)` es destino de la FK de productos. */
export const catalogCategoriesTable = pgTable(
  'catalog_categories',
  {
    id: text('id').primaryKey(),
    storeId: text('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    icon: text('icon'),
    slug: text('slug'),
    illustrationUrl: text('illustration_url'),
    sortOrder: integer('sort_order'),
    version: integer('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => ({
    storeScoped: unique('catalog_categories_store_id_unique').on(t.storeId, t.id),
    slugPerStore: unique('catalog_categories_store_slug_unique').on(t.storeId, t.slug),
    versionValid: check('catalog_categories_version_positive', sql`${t.version} >= 1`),
  }),
)

/**
 * Productos por tienda (T-07). La FK compuesta `(store_id, category_id)` impide usar una
 * categoría de otra tienda y, con RESTRICT, borrar una categoría con productos, de forma
 * atómica incluso ante escrituras concurrentes. No hay borrado de productos: se archivan.
 */
export const catalogProductsTable = pgTable(
  'catalog_products',
  {
    id: text('id').primaryKey(),
    storeId: text('store_id').notNull(),
    categoryId: text('category_id').notNull(),
    name: text('name').notNull(),
    displayName: text('display_name'),
    legalName: text('legal_name'),
    price: integer('price').notNull(),
    originalPrice: integer('original_price'),
    unit: text('unit').notNull(),
    imageUrl: text('image_url').notNull(),
    inStock: boolean('in_stock').notNull(),
    isVariableWeight: boolean('is_variable_weight').notNull(),
    badge: text('badge'),
    currency: text('currency').notNull(),
    description: text('description'),
    nutritionalInfo: jsonb('nutritional_info').$type<NutritionalInfoDto>(),
    availability: text('availability_label'),
    active: boolean('active').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    version: integer('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => ({
    categoryOfStore: foreignKey({
      name: 'catalog_products_category_same_store_fk',
      columns: [t.storeId, t.categoryId],
      foreignColumns: [catalogCategoriesTable.storeId, catalogCategoriesTable.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    byStore: index('catalog_products_by_store').on(t.storeId, t.createdAt),
    byCategory: index('catalog_products_by_category').on(t.storeId, t.categoryId),
    priceValid: check(
      'catalog_products_price_valid',
      sql`${t.price} between 1 and 100000000 and (${t.originalPrice} is null or (${t.originalPrice} > ${t.price} and ${t.originalPrice} <= 100000000))`,
    ),
    currencyValid: check('catalog_products_currency_cop', sql`${t.currency} = 'COP'`),
    unitCoherent: check(
      'catalog_products_unit_coherent',
      sql`(${t.isVariableWeight} and ${t.unit} = 'Por Kilogramo') or (not ${t.isVariableWeight} and ${t.unit} <> 'Por Kilogramo')`,
    ),
    versionValid: check('catalog_products_version_positive', sql`${t.version} >= 1`),
  }),
)
