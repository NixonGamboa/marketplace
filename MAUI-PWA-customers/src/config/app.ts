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
