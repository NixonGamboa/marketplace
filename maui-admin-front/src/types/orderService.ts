// Service-layer types for the Order Service contract.
// These types match the REST API contract defined in the technical spec
// and are used by both mockOrderService and realOrderService.

export type OrderStatus = 'received' | 'confirmed' | 'preparing' | 'ready' | 'delivered'

export type DeliveryType = 'pickup' | 'delivery'

export type SubstitutionPref = 'call_me' | 'similar' | 'remove'

export type TimeSlot = 'morning' | 'afternoon' | 'asap'

/**
 * Ítem del carrito / pedido.
 *
 * Productos de **peso variable** (ej. carnes, granos por kg) usan `priceAtMoment`
 * como **precio por kilogramo** (ADR-006). Para esos productos:
 *  - `is_variable_weight = true`
 *  - `kilosRequested` = peso solicitado por el cliente al ordenar
 *  - `kilosReal` = peso real pesado en mostrador por el aliado al preparar el
 *    pedido (capturado desde el panel admin). Hasta que el aliado lo registra
 *    queda `undefined`; ese es el valor que se usa para el cobro final.
 * Para productos de peso fijo los tres campos quedan ausentes y `qty` es la
 * cantidad de unidades.
 */
export interface CartItem {
  id: string
  qty: number
  priceAtMoment: number
  is_variable_weight?: boolean
  kilosRequested?: number
  kilosReal?: number
}

export interface DeliveryData {
  address?: string
  lat?: number
  lng?: number
  timeSlot?: TimeSlot
}

export interface OrderPayload {
  userId: string
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
  userId: string
  status: OrderStatus
  items: CartItem[]
  deliveryType: DeliveryType
  deliveryData: DeliveryData
  substitutionPreference: SubstitutionPref
  customerName: string
  /**
   * Teléfono del cliente normalizado para `wa.me` / `tel:`: sólo dígitos,
   * incluyendo el prefijo de país sin `+`, sin espacios ni guiones.
   * Ej: `573015550101` para +57 301 555 0101. Es opcional para pedidos
   * legacy creados antes de capturar el teléfono.
   */
  customerPhone?: string
  estimatedTotal: number
  createdAt: string
  updatedAt?: string
}

export interface OrderService {
  submit(payload: OrderPayload): Promise<OrderConfirmation>
  getById(orderId: string): Promise<Order>
  list(userId?: string): Promise<Order[]>
}
