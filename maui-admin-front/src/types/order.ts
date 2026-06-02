// Shared admin-side types for the Order domain.
// Intentionally replicated from MAUI-PWA-customers to avoid cross-project coupling.
// Source of truth: MAUI-PWA-customers/client/src/types/orderService.ts

export type OrderStatus = 'received' | 'confirmed' | 'preparing' | 'ready' | 'delivered'

export type DeliveryType = 'pickup' | 'delivery'

export type SubstitutionPref = 'call_me' | 'similar' | 'remove'

export type TimeSlot = 'morning' | 'afternoon' | 'asap'

export interface CartItem {
  id: string
  qty: number
  priceAtMoment: number
}

export interface DeliveryData {
  address?: string
  lat?: number
  lng?: number
  timeSlot?: TimeSlot
}

export interface Order {
  orderId: string
  status: OrderStatus
  items: CartItem[]
  deliveryType: DeliveryType
  deliveryData: DeliveryData
  substitutionPreference: SubstitutionPref
  customerName: string
  estimatedTotal: number
  createdAt: string
  updatedAt?: string
}
