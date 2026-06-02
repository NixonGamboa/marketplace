import type { OrderStatus } from '@/types/order'

// Número real de Leche y Miel (env-driven con placeholder)
export const WHATSAPP_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined) ?? '+573000000000'
// TODO: confirmar número real antes del deploy

type MessageBuilder = (customerName: string, orderId: string) => string

export const WHATSAPP_TEMPLATES: Record<Exclude<OrderStatus, 'received'>, MessageBuilder> = {
  confirmed: (name, id) => `Hola ${name}, ya recibimos tu pedido ${id} 🛒 Lo estamos confirmando.`,
  preparing: (name, id) => `Hola ${name}, ya estamos preparando tu pedido ${id} 📦`,
  ready:     (name, id) => `Hola ${name}, tu mercado ${id} está listo para entrega 🎉`,
  delivered: (name, id) => `Hola ${name}, tu pedido ${id} fue entregado. ¡Gracias por tu compra! 🙏`,
}

export function buildWhatsAppLink(status: Exclude<OrderStatus, 'received'>, name: string, orderId: string): string {
  const message = WHATSAPP_TEMPLATES[status](name, orderId)
  const cleanNumber = WHATSAPP_NUMBER.replace(/[^0-9]/g, '')
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`
}
