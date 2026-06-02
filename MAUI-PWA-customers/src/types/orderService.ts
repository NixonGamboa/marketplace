// Service-layer types for the Order Service contract.
// These types match the REST API contract defined in the technical spec
// and are used by both mockOrderService and realOrderService.

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

export interface OrderPayload {
  items: CartItem[]
  substitutionPreference: SubstitutionPref
  deliveryType: DeliveryType
  deliveryData: DeliveryData
  customerName: string
}

export interface OrderConfirmation {
  orderId: string
  status: 'received'
  estimatedTotal: number
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

export interface OrderService {
  submit(payload: OrderPayload): Promise<OrderConfirmation>
  getById(orderId: string): Promise<Order>
  list(): Promise<Order[]>
}
