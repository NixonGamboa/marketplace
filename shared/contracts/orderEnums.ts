/**
 * Vocabulario común de pedidos (sin Zod ni runtime): estados, modalidades,
 * sustitución, franjas y la máquina de transiciones.
 */

export const ORDER_STATUS_VALUES = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'in_delivery',
  'delivered',
  'cancelled',
] as const

export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number]

export const OrderStatus = {
  RECEIVED: 'received',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  IN_DELIVERY: 'in_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const satisfies Record<string, OrderStatus>

export const DELIVERY_TYPE_VALUES = ['pickup', 'delivery'] as const

export type DeliveryType = (typeof DELIVERY_TYPE_VALUES)[number]

/**
 * Preferencia ante un producto agotado:
 *  - `call_me`: avisar al cliente antes de cambiar nada.
 *  - `similar`: reemplazar por un producto similar.
 *  - `remove`: quitar el producto del pedido sin reemplazo.
 */
export const SUBSTITUTION_PREF_VALUES = ['call_me', 'similar', 'remove'] as const

export type SubstitutionPref = (typeof SUBSTITUTION_PREF_VALUES)[number]

export const TIME_SLOT_VALUES = ['morning', 'afternoon', 'asap'] as const

export type TimeSlot = (typeof TIME_SLOT_VALUES)[number]

export const isOrderStatus = (value: string): value is OrderStatus =>
  (ORDER_STATUS_VALUES as readonly string[]).includes(value)

export const isDeliveryType = (value: string): value is DeliveryType =>
  (DELIVERY_TYPE_VALUES as readonly string[]).includes(value)

export const isSubstitutionPref = (value: string): value is SubstitutionPref =>
  (SUBSTITUTION_PREF_VALUES as readonly string[]).includes(value)

export const isTimeSlot = (value: string): value is TimeSlot =>
  (TIME_SLOT_VALUES as readonly string[]).includes(value)

/**
 * Flujo: received → confirmed → preparing → ready → delivered.
 * Solo en `delivery`, desde `ready` se puede pasar por `in_delivery` (paso opcional;
 * en `pickup` no existe). Cancelar es posible hasta `ready`; `delivered`,
 * `cancelled` e `in_delivery`→cancelled no se permiten.
 * La atomicidad de la transición (UPDATE condicional) es T-12.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  received: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  in_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
}

export const allowedNextStatuses = (
  current: OrderStatus,
  deliveryType: DeliveryType,
): readonly OrderStatus[] =>
  current === 'ready' && deliveryType === 'delivery'
    ? ['in_delivery', 'delivered', 'cancelled']
    : TRANSITIONS[current]

export const canTransition = (
  current: OrderStatus,
  next: OrderStatus,
  deliveryType: DeliveryType,
): boolean => allowedNextStatuses(current, deliveryType).includes(next)
