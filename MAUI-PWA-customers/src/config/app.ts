import type { TimeSlot, OrderStatus } from '@/types/orderService'
import type { User } from '@/types/auth'

export const APP_NAME = 'MAUI'

/** Horario de atención: { open: 'HH:MM', close: 'HH:MM' } en hora local */
export const STORE_SCHEDULE = {
  open: '07:00',
  close: '19:00',
  scheduleLabel: 'L–S 7 am – 7 pm',
  deliveryCutoff: 'Pedidos antes de las 5 pm',
} as const
export const SUPPORT_EMAIL = 'soporte@maui.com.co'
export const SUPPORT_PHONE = '+57 310 000 0000'
export const SUPPORT_PHONE_RAW = '+573100000000'
// TODO: confirmar número real de Leche y Miel con el aliado antes del deploy
export const WHATSAPP_SUPPORT_NUMBER = '+573000000000'
export const WHATSAPP_ORDER_NUMBER = WHATSAPP_SUPPORT_NUMBER
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_SUPPORT_NUMBER}`
export const MERCHANT_NAME = 'Leche y Miel'
export const SEARCH_PLACEHOLDER = `Buscar en ${APP_NAME}`
export const HERO_AUTOPLAY_INTERVAL = 6000
export const CART_BADGE_MAX = 99

// ─── Envío ───────────────────────────────────────────────────────────────────
/** Subtotal del carrito (COP) a partir del cual el envío es gratis */
export const FREE_SHIPPING_THRESHOLD = 30_000
/** Costo estándar de envío (COP) cuando el subtotal no alcanza el umbral */
export const STANDARD_SHIPPING_COST = 3_000

// ─── Franjas horarias ─────────────────────────────────────────────────────────

/** Opciones del picker de franja horaria (selector de recogida). */
export const TIME_SLOT_OPTIONS: readonly { value: TimeSlot; label: string; description: string }[] = [
  { value: 'morning',   label: 'Mañana',          description: '8 am – 12 pm'          },
  { value: 'afternoon', label: 'Tarde',            description: '12 pm – 5 pm'          },
  { value: 'asap',      label: 'Lo antes posible', description: 'Según disponibilidad'  },
]

/** Subtexto de la opción "Recoger en tienda" cuando ya se eligió franja. */
export const PICKUP_SUBTEXT: Record<TimeSlot, string> = {
  morning:   'Recoge tu pedido entre 8 am y 12 pm',
  afternoon: 'Recoge tu pedido entre 12 pm y 5 pm',
  asap:      'Recoge lo antes posible',
}

/** Etiqueta compacta para el resumen del checkout (paso 3). */
export const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  morning:   'Mañana (8 am – 12 pm)',
  afternoon: 'Tarde (12 pm – 5 pm)',
  asap:      'Lo antes posible',
}

/** Etiqueta en el detalle de un pedido ya enviado. */
export const TIME_SLOT_LABELS_ORDER: Record<TimeSlot, string> = {
  morning:   'Recoges esta mañana',
  afternoon: 'Recoges esta tarde',
  asap:      'Recoges lo antes posible',
}

// ─── Mensajes WhatsApp (cliente → comerciante) ────────────────────────────────

export const WA_MESSAGES: Record<OrderStatus, (id: string) => string> = {
  received:  (id) => `Hola, acabo de hacer mi pedido ${id}. ¿Pueden confirmarlo?`,
  confirmed: (id) => `Hola, sobre mi pedido ${id} ¿alguna actualización?`,
  preparing: (id) => `Hola, sobre mi pedido ${id} ¿cuánto falta?`,
  ready:     (id) => `Hola, sobre mi pedido ${id} listo para entrega`,
  delivered: (id) => `Hola, sobre mi pedido ${id}`,
}

// ─── Demo ─────────────────────────────────────────────────────────────────────

export const DEMO_USER: User = {
  id: 'demo-user-001',
  name: 'Usuario Demo',
  phone: '+573001234567',
  isAuthenticated: true,
}
