import type { OrderDto, OrderItemDto } from '../contracts/orders.js'
import type { OrderProcessingNoticeDto, StoreDto } from '../contracts/store.js'
import type { TimeSlot, PaymentMethod, DeliveryType } from '../contracts/orderEnums.js'
import { formatOrderReference } from '../contracts/orders.js'
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

const processingTime = new Intl.DateTimeFormat('es-CO', {
  timeZone: STORE_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true,
})
/** ICU separa «a. m.» con espacios especiales (NBSP/NNBSP); NFKC los reduce a un espacio normal. */
const plainSpaces = (text: string): string => text.normalize('NFKC')

const SLOT_DESCRIPTIONS: Record<TimeSlot, string> = {
  morning: 'por la mañana', afternoon: 'por la tarde', asap: 'lo antes posible',
}
const calendarDay = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })

/**
 * Franja elegida con la fecha fijada por el servidor al crear el pedido (`timeSlotDate`, fecha civil de
 * Bogotá): «por la mañana · martes, 6 de octubre». Sin fecha registrada solo dice la franja. Nunca usa
 * «hoy»/«mañana» relativos (la franja «mañana» es la de la mañana) y no es la hora de procesamiento.
 */
export const describeTimeSlot = (slot: TimeSlot, timeSlotDate?: string): string =>
  timeSlotDate === undefined
    ? SLOT_DESCRIPTIONS[slot]
    : plainSpaces(`${SLOT_DESCRIPTIONS[slot]} · ${calendarDay.format(new Date(`${timeSlotDate}T12:00:00Z`))}`)

/**
 * Aviso mostrado tras persistir un pedido recibido fuera de atención. Informa cuándo empieza el
 * procesamiento (nunca una hora de entrega o recogida) y no inventa una hora si no se conoce.
 */
export const processingNoticeMessage = (notice: OrderProcessingNoticeDto, status: OrderStatus = 'received', now: Date = new Date()): string => {
  if (status !== 'received') return STATUS_LABELS[status]
  let when = 'en nuestro próximo horario de atención'
  if (notice.kind === 'scheduled') {
    const startsAt = new Date(notice.startsAt)
    if (Number.isFinite(startsAt.getTime())) {
      if (startsAt.getTime() <= now.getTime()) return 'Tu pedido está pendiente de preparación. Puedes consultar aquí su estado.'
      const civilDay = (value: Date) => {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
        const part = (type: string) => Number(parts.find((entry) => entry.type === type)!.value)
        return Date.UTC(part('year'), part('month') - 1, part('day'))
      }
      const days = (civilDay(startsAt) - civilDay(now)) / 86_400_000
      const time = plainSpaces(processingTime.format(startsAt)).replace(':00', '')
      if (days === 0) when = `hoy desde las ${time}`
      else if (days === 1) when = `mañana a primera hora, desde las ${time}`
    }
  }
  return `¡Recibimos tu pedido! En este momento estamos descansando. Comenzaremos a prepararlo ${when}${when.endsWith('.') ? '' : '.'} Puedes ver su estado aquí.`
}

/** La demo sin referencia conserva una etiqueta neutra; nunca fabrica una numeración. */
export const orderReferenceLabel = (order: Pick<OrderDto, 'reference'>): string => order.reference === undefined ? 'Pedido' : formatOrderReference(order.reference)
export const paymentMethodLabel = (method: PaymentMethod = 'cash'): string => ({ cash: 'Efectivo', qr: 'Código QR', bre_b: 'Transferencia Bre-B' })[method]
export const paymentOnReceiptMessage = (mode: DeliveryType): string => `Pagas el total final al ${mode === 'pickup' ? 'recoger' : 'recibir'} tu pedido.`

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
  const name = item.name ?? 'Producto'
  const measure = item.is_variable_weight
    ? `${quantity(item.kilosRequested!)} kg solicitados${final ? `; ${item.kilosReal === undefined ? 'peso real pendiente' : `${quantity(item.kilosReal)} kg reales`}` : ''}`
    : `${item.qty} × ${item.unit ?? 'unidad no registrada'}`
  const amount = final ? itemFinalTotal(item) : itemEstimatedTotal(item)
  return {
    id: item.id,
    description: `${name}: ${measure}; ${formatReceiptMoney(item.priceAtMoment)}${item.is_variable_weight ? '/kg' : ' por unidad'}${item.substitutedFor ? '; producto sustituto' : ''}`,
    ...(amount !== undefined ? { amount } : {}),
  }
}
const lineText = (line: ReceiptLine): string =>
  `${line.description} — ${line.amount === undefined ? 'importe pendiente' : formatReceiptMoney(line.amount)}`

/** Solo refleja importes y estado del DTO. La estimación conserva siempre los ítems originales. */
export const buildOrderReceipt = (order: OrderDto, now: Date = new Date()): OrderReceipt => {
  const originalLines = (order.originalItems ?? order.items).map((item) => lineFrom(item, false))
  const currentLines = order.items.map((item) => lineFrom(item, true))
  const rows = [
    orderReferenceLabel(order), `Estado: ${STATUS_LABELS[order.status]}`,
    `Pago: ${paymentMethodLabel(order.paymentMethod)}`,
    `Creado: ${date(order.createdAt)} (Colombia)`,
    ...(order.updatedAt ? [`Actualizado: ${date(order.updatedAt)} (Colombia)`] : []),
    `Modalidad: ${order.deliveryType === 'pickup' ? 'Recogida en tienda' : 'Domicilio'}`,
    ...(order.deliveryData.timeSlot ? [`Franja de recogida: ${describeTimeSlot(order.deliveryData.timeSlot, order.timeSlotDate)}`] : []),
    // El aviso es del momento de la recepción: deja de aplicar cuando el personal ya actuó sobre el pedido.
    ...(order.processingNotice && order.status === 'received' ? [processingNoticeMessage(order.processingNotice, order.status, now)] : []),
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
