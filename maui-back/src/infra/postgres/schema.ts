import { sql } from 'drizzle-orm'
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
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
