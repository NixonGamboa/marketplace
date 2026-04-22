export const ORDER_STATUS = {
  RECEIVED:   'received',   // Recibido — servidor confirmó el pedido
  PREPARING:  'preparing',  // Preparando — empleado empezó a armar
  READY:      'ready',      // Listo/Pesado — empacado, esperando despacho
  IN_TRANSIT: 'in_transit', // En Camino — domiciliario en ruta
  DELIVERED:  'delivered',  // Entregado — confirmado
} as const

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS]

export type DeliveryMode = 'pickup' | 'delivery'

export type SubstitutionPreference =
  | 'call_me'              // Llamarme por teléfono
  | 'similar_product'      // Cambiar por similar (marca/precio)
  | 'remove_and_discount'  // No enviar y descontar

export interface OrderItem {
  productId: string
  name: string
  quantity: number
  unit: string
  price_at_moment: number    // precio al momento del pedido
  price_final?: number       // ajustado tras pesaje (productos variables)
  is_variable_weight: boolean
}

export interface DeliveryData {
  address?: string
  lat?: number
  lng?: number
  time_slot?: string         // ej. "10:00 AM – 11:00 AM"
}

export interface Order {
  orderId: string
  userId: string
  items: OrderItem[]
  status: OrderStatus
  total_estimated: number    // suma de price_at_moment × qty
  total_final?: number       // calculado tras pesaje (puede diferir)
  delivery_mode: DeliveryMode
  delivery_data: DeliveryData
  substitutionPreference: SubstitutionPreference
  customer_name: string
  createdAt: string          // ISO 8601
  updatedAt?: string
  photoUrl?: string          // presigned URL de S3 cuando status = 'ready'
}
