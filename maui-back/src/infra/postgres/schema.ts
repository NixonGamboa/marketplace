import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
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
