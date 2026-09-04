import { z } from 'zod'

export const OrderStatus = {
  RECEIVED: 'received',
  PREPARING: 'preparing',
  READY: 'ready',
  IN_DELIVERY: 'in_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]

export const DeliveryMode = {
  PICKUP: 'pickup',
  DELIVERY: 'delivery',
} as const

export type DeliveryMode = (typeof DeliveryMode)[keyof typeof DeliveryMode]

export const SubstitutionPreference = {
  ALLOW: 'allow',
  ASK: 'ask',
  NONE: 'none',
} as const

export type SubstitutionPreference =
  (typeof SubstitutionPreference)[keyof typeof SubstitutionPreference]

export const orderItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  priceAtMoment: z.number().int().nonnegative(),
  quantity: z.number().int().positive().optional(),
  kilos: z.number().positive().optional(),
  isVariableWeight: z.boolean(),
})

export type OrderItem = z.infer<typeof orderItemSchema>

export const orderSchema = z.object({
  id: z.string(),
  storeId: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  items: z.array(orderItemSchema).min(1),
  total: z.number().int().nonnegative(),
  status: z.enum([
    OrderStatus.RECEIVED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.IN_DELIVERY,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ]),
  deliveryMode: z.enum([DeliveryMode.PICKUP, DeliveryMode.DELIVERY]),
  deliveryAddress: z.string().optional(),
  substitutionPreference: z.enum([
    SubstitutionPreference.ALLOW,
    SubstitutionPreference.ASK,
    SubstitutionPreference.NONE,
  ]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Order = z.infer<typeof orderSchema>

export const newOrderInputSchema = orderSchema
  .omit({ id: true, status: true, createdAt: true, updatedAt: true, total: true })
  .strict()

export type NewOrderInput = z.infer<typeof newOrderInputSchema>
