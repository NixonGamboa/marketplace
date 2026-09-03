import { pgTable, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import type { OrderItem } from '../../domain/orders/Order.js'

export const ordersTable = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    storeId: text('store_id').notNull(),
    customerId: text('customer_id').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    items: jsonb('items').$type<OrderItem[]>().notNull(),
    total: integer('total').notNull(),
    status: text('status').notNull(),
    deliveryMode: text('delivery_mode').notNull(),
    deliveryAddress: text('delivery_address'),
    substitutionPreference: text('substitution_preference').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => ({
    byStoreStatus: index('orders_by_store_status').on(t.storeId, t.status, t.createdAt),
  }),
)
