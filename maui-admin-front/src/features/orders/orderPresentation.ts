/**
 * Textos y formatos de pedidos para el personal (ME-03/ME-04). Puro y sin runtime: etiquetas de dominio en
 * español, referencia comercial y nombres de producto. Nunca muestra identificadores técnicos si hay un nombre.
 */
import type { DeliveryType, OrderStatus, SubstitutionPref } from '@/types/orderService'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Recibido',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Listo',
  in_delivery: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export const DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  pickup: 'Retiro en tienda',
  delivery: 'Domicilio',
}

export const SUBSTITUTION_LABELS: Record<SubstitutionPref, string> = {
  call_me: 'Llamarlo antes de cambiar nada',
  similar: 'Aceptar un producto similar',
  remove: 'Quitar lo que falte',
}

const currency = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const kilos = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 })

export const formatCop = (amount: number): string => currency.format(amount)
export const formatKilos = (value: number): string => `${kilos.format(value)} kg`

/** Producto sin nombre en el pedido (demo): el catálogo lo resuelve; sin él, un texto neutro, nunca su ID. */
export const itemDisplayName = (item: { id: string; name?: string | undefined }, resolved: Record<string, string> = {}): string =>
  item.name ?? resolved[item.id] ?? 'Producto'

/** Antigüedad legible del pedido («Hace 5 minutos»). */
export function orderAgeLabel(createdAt: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60_000))
  if (minutes < 1) return 'Hace un momento'
  if (minutes < 60) return minutes === 1 ? 'Hace 1 minuto' : `Hace ${minutes} minutos`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? 'Hace 1 hora' : `Hace ${hours} horas`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Hace 1 día' : `Hace ${days} días`
}

/** Mensaje de WhatsApp para el cliente según el estado; usa la misma referencia que el resto de canales. */
export function messageForStatus(status: OrderStatus, reference: string): string {
  switch (status) {
    case 'received':
      return `${reference}: lo recibimos. Si necesito consultarte alguna sustitución te aviso.`
    case 'confirmed':
      return `${reference}: lo confirmamos y estamos alistándolo.`
    case 'preparing':
      return `${reference}: ya está en preparación.`
    case 'ready':
      return `${reference}: está listo para recoger o ser enviado.`
    case 'in_delivery':
      return `${reference}: va en camino.`
    case 'delivered':
      return `${reference}: fue entregado. ¡Gracias por tu compra!`
    case 'cancelled':
      return `${reference}: fue cancelado. Escríbenos si necesitas ayuda.`
  }
}
