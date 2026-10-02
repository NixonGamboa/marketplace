import {
  isDeliveryType,
  isOrderStatus,
  isSubstitutionPref,
  isTimeSlot,
  normalizeColombianMobile,
  normalizeIsoUtc,
} from '../../../../shared/contracts/index.js'
import type {
  DeliveryDataDto,
  DeliveryType,
  OrderItemDto,
  SubstitutionPref,
} from '../../../../shared/contracts/index.js'
import type { Order } from './Order.js'

/**
 * Forma plana persistida de un pedido (fila de `orders`) y su mapeo explícito
 * desde/hacia el modelo interno, incluyendo filas legacy anteriores a T-04.
 *
 * Mapeo legacy (solo lectura; no hay UPDATE de datos en la migración aditiva):
 *  - ítem `{ productId, quantity, kilos, isVariableWeight }` → `{ id, qty, kilosRequested }`;
 *    `kilos` legacy era el peso pedido: jamás se convierte en `kilosReal`.
 *  - sustitución `ask|allow|none` → `call_me|similar|remove`.
 *  - `total` legacy (solo ítems, sin envío) → `estimatedTotal`; `shipping_cost`/`final_total` NULL = desconocido.
 *  - `customer_phone` se normaliza a canónico (`57…`); si no es recuperable se omite.
 */

export interface LegacyOrderItem {
  productId: string
  name: string
  priceAtMoment: number
  quantity?: number
  kilos?: number
  isVariableWeight: boolean
}

export type StoredOrderItem = OrderItemDto | LegacyOrderItem

export interface StoredOrderRecord {
  id: string
  storeId: string
  customerId: string
  customerName: string
  customerPhone: string
  items: StoredOrderItem[]
  /** Columna `total`: estimación original (ítems + envío; solo ítems en legacy). */
  total: number
  status: string
  /** Columna `delivery_mode`: `pickup` | `delivery`. */
  deliveryMode: string
  deliveryAddress: string | null
  deliveryLat: number | null
  deliveryLng: number | null
  deliveryTimeSlot: string | null
  substitutionPreference: string
  shippingCost: number | null
  finalTotal: number | null
  createdAt: string
  updatedAt: string
  version: number
  updatedBy: string | null
  /** Columna `original_items` (T-12): ítems al pedir, fijados en la primera sustitución/retiro. */
  originalItems: StoredOrderItem[] | null
  cancellationReason: string | null
  cancelledAt: string | null
}

const LEGACY_SUBSTITUTION: Record<string, SubstitutionPref> = {
  ask: 'call_me',
  allow: 'similar',
  none: 'remove',
}

const isLegacyItem = (item: StoredOrderItem): item is LegacyOrderItem => 'productId' in item

const itemFromStored = (item: StoredOrderItem): OrderItemDto => (isLegacyItem(item) ? fromLegacyItem(item) : item)

export const fromLegacyItem = (item: LegacyOrderItem): OrderItemDto => {
  const base = { id: item.productId, name: item.name, priceAtMoment: item.priceAtMoment }
  if (item.isVariableWeight) {
    return {
      ...base,
      qty: 1,
      is_variable_weight: true,
      ...(item.kilos !== undefined ? { kilosRequested: item.kilos } : {}),
    }
  }
  return { ...base, qty: item.quantity ?? 1 }
}

export const substitutionFromStored = (value: string): SubstitutionPref => {
  if (isSubstitutionPref(value)) return value
  const mapped = LEGACY_SUBSTITUTION[value]
  if (!mapped) throw new Error(`Preferencia de sustitución desconocida: ${value}`)
  return mapped
}

const deliveryTypeFromStored = (value: string): DeliveryType => {
  if (!isDeliveryType(value)) throw new Error(`Modalidad de entrega desconocida: ${value}`)
  return value
}

const deliveryDataFromRecord = (
  record: StoredOrderRecord,
  deliveryType: DeliveryType,
): DeliveryDataDto => {
  const data: DeliveryDataDto = {}
  if (deliveryType === 'delivery') {
    if (record.deliveryAddress !== null) data.address = record.deliveryAddress
    if (record.deliveryLat !== null && record.deliveryLng !== null) {
      data.lat = record.deliveryLat
      data.lng = record.deliveryLng
    }
  }
  if (record.deliveryTimeSlot !== null && isTimeSlot(record.deliveryTimeSlot)) {
    data.timeSlot = record.deliveryTimeSlot
  }
  return data
}

export const orderFromRecord = (record: StoredOrderRecord): Order => {
  if (!isOrderStatus(record.status)) throw new Error(`Estado desconocido: ${record.status}`)
  const deliveryType = deliveryTypeFromStored(record.deliveryMode)
  const customerPhone = normalizeColombianMobile(record.customerPhone)

  return {
    id: record.id,
    storeId: record.storeId,
    customerId: record.customerId,
    customerName: record.customerName,
    ...(customerPhone !== null ? { customerPhone } : {}),
    items: record.items.map(itemFromStored),
    status: record.status,
    deliveryType,
    deliveryData: deliveryDataFromRecord(record, deliveryType),
    substitutionPreference: substitutionFromStored(record.substitutionPreference),
    ...(record.shippingCost !== null ? { shippingCost: record.shippingCost } : {}),
    estimatedTotal: record.total,
    ...(record.finalTotal !== null ? { finalTotal: record.finalTotal } : {}),
    createdAt: normalizeIsoUtc(record.createdAt),
    updatedAt: normalizeIsoUtc(record.updatedAt),
    version: record.version,
    ...(record.updatedBy !== null ? { updatedBy: record.updatedBy } : {}),
    ...(record.originalItems !== null ? { originalItems: record.originalItems.map(itemFromStored) } : {}),
    ...(record.cancellationReason !== null ? { cancellationReason: record.cancellationReason } : {}),
    ...(record.cancelledAt !== null ? { cancelledAt: normalizeIsoUtc(record.cancelledAt) } : {}),
  }
}

export const orderToRecord = (order: Order): StoredOrderRecord => ({
  id: order.id,
  storeId: order.storeId,
  customerId: order.customerId,
  customerName: order.customerName,
  customerPhone: order.customerPhone ?? '',
  items: order.items,
  total: order.estimatedTotal,
  status: order.status,
  deliveryMode: order.deliveryType,
  deliveryAddress: order.deliveryData.address ?? null,
  deliveryLat: order.deliveryData.lat ?? null,
  deliveryLng: order.deliveryData.lng ?? null,
  deliveryTimeSlot: order.deliveryData.timeSlot ?? null,
  substitutionPreference: order.substitutionPreference,
  shippingCost: order.shippingCost ?? null,
  finalTotal: order.finalTotal ?? null,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  version: order.version,
  updatedBy: order.updatedBy ?? null,
  originalItems: order.originalItems ?? null,
  cancellationReason: order.cancellationReason ?? null,
  cancelledAt: order.cancelledAt ?? null,
})
