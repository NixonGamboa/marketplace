import type { OrderDto, OrderItemDto } from '../contracts/orders.js'
import type { StoreDto } from '../contracts/store.js'
import { PLACEHOLDER_CONTACT_PHONE, STORE_TIME_ZONE } from '../contracts/store.js'
import { normalizeColombianMobile } from '../contracts/common.js'
import { itemEstimatedTotal, itemFinalTotal } from '../contracts/orderPricing.js'
import type { OrderStatus } from '../contracts/orderEnums.js'

const STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Recibido', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Listo', in_delivery: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado',
}
export const formatReceiptMoney = (amount: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)
const quantity = (value: number): string => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(value)
const date = (iso: string): string => new Intl.DateTimeFormat('es-CO', {
  timeZone: STORE_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(iso))

export interface ReceiptLine {
  id: string
  description: string
  amount?: number
}
export interface OrderReceipt {
  orderId: string
  status: OrderStatus
  /** Texto apto para la UI y para un mensaje preparado; no contiene teléfono ni dirección. */
  text: string
  rows: string[]
  originalLines: ReceiptLine[]
  currentLines: ReceiptLine[]
  estimatedTotal: number
  finalTotal?: number
}
export interface ReceiptContact {
  url: string
  label: string
}
export interface ReceiptResult {
  receipt: OrderReceipt
  contact: ReceiptContact | null
  contactUnavailable?: string
}

const lineFrom = (item: OrderItemDto, final: boolean): ReceiptLine => {
  const name = item.name ?? `Producto ${item.id}`
  const measure = item.is_variable_weight
    ? `${quantity(item.kilosRequested!)} kg solicitados${final ? `; ${item.kilosReal === undefined ? 'peso real pendiente' : `${quantity(item.kilosReal)} kg reales`}` : ''}`
    : `${item.qty} × ${item.unit ?? 'unidad no registrada'}`
  const amount = final ? itemFinalTotal(item) : itemEstimatedTotal(item)
  return {
    id: item.id,
    description: `${name}: ${measure}; ${formatReceiptMoney(item.priceAtMoment)}${item.is_variable_weight ? '/kg' : ' por unidad'}${item.substitutedFor ? `; sustituye producto ${item.substitutedFor}` : ''}`,
    ...(amount !== undefined ? { amount } : {}),
  }
}
const lineText = (line: ReceiptLine): string =>
  `${line.description} — ${line.amount === undefined ? 'importe pendiente' : formatReceiptMoney(line.amount)}`

/** Solo refleja importes y estado del DTO. La estimación conserva siempre los ítems originales. */
export const buildOrderReceipt = (order: OrderDto): OrderReceipt => {
  const originalLines = (order.originalItems ?? order.items).map((item) => lineFrom(item, false))
  const currentLines = order.items.map((item) => lineFrom(item, true))
  const rows = [
    `Pedido ${order.orderId}`, `Estado: ${STATUS_LABELS[order.status]}`,
    `Creado: ${date(order.createdAt)} (Colombia)`,
    ...(order.updatedAt ? [`Actualizado: ${date(order.updatedAt)} (Colombia)`] : []),
    `Modalidad: ${order.deliveryType === 'pickup' ? 'Recogida en tienda' : 'Domicilio'}`,
    'Estimación original:', ...originalLines.map(lineText),
    ...(order.shippingCost === undefined ? ['Envío: no registrado'] : [
      `Subtotal estimado original: ${formatReceiptMoney(order.estimatedTotal - order.shippingCost)}`,
      `Envío: ${formatReceiptMoney(order.shippingCost)}`,
    ]),
    `Total estimado original: ${formatReceiptMoney(order.estimatedTotal)}`,
    'Ítems vigentes:', ...currentLines.map(lineText),
    ...(order.originalItems ? ['Los ítems vigentes reflejan sustituciones o retiros realizados por la tienda.'] : []),
    ...(order.finalTotal === undefined ? ['Total final: pendiente de confirmación de la tienda'] : [
      ...(order.shippingCost === undefined ? [] : [`Subtotal final: ${formatReceiptMoney(order.finalTotal - order.shippingCost)}`]),
      `Total final${order.status === 'cancelled' ? ' registrado antes de cancelar' : ''}: ${formatReceiptMoney(order.finalTotal)}`,
    ]),
    ...(order.status === 'cancelled' ? ['Pedido cancelado. Los importes son de referencia.',
      ...(order.cancellationReason ? [`Motivo: ${order.cancellationReason}`] : []),
      ...(order.cancelledAt ? [`Cancelado: ${date(order.cancelledAt)} (Colombia)`] : []),
    ] : []),
  ]
  return { orderId: order.orderId, status: order.status, rows, text: rows.join('\n'), originalLines,
    currentLines, estimatedTotal: order.estimatedTotal,
    ...(order.finalTotal !== undefined ? { finalTotal: order.finalTotal } : {}),
  }
}

export const receiptWhatsAppContact = (phone: string | null | undefined, receipt: OrderReceipt, label: string): ReceiptContact | null => {
  const canonical = phone ? normalizeColombianMobile(phone) : null
  if (canonical === null || canonical === PLACEHOLDER_CONTACT_PHONE) return null
  const message = `Hola, consulto por este pedido de MAUI:\n${receipt.text}`
  return { url: `https://wa.me/${canonical}?text=${encodeURIComponent(message)}`, label }
}
export const customerReceiptFrom = (order: OrderDto, store: Pick<StoreDto, 'contactPhone'> | null): ReceiptResult => {
  const receipt = buildOrderReceipt(order)
  return { receipt, contact: receiptWhatsAppContact(store?.contactPhone, receipt, 'Contactar a la tienda') }
}
export const staffReceiptFrom = (order: OrderDto): ReceiptResult => {
  const receipt = buildOrderReceipt(order)
  return { receipt, contact: receiptWhatsAppContact(order.customerPhone, receipt, 'Contactar al cliente') }
}
