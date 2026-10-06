import {
  toV1OrderConfirmation,
  toV1OrderDto,
  toV1OrderList,
  orderConfirmationSchema,
  orderDtoSchema,
  orderListResponseSchema,
  type DeliveryDataDto,
  type ContractVersion,
  type OrderConfirmationDto,
  type OrderListResponse,
  type OrderDto,
  type OrderItemDto,
} from '../../../../shared/contracts/index.js'
import type { Order } from './Order.js'

/** Copia solo los campos del contrato: un ítem persistido con props extra no se filtra. */
const toItemDto = (item: OrderItemDto): OrderItemDto => ({
  id: item.id,
  ...(item.name !== undefined ? { name: item.name } : {}),
  ...(item.unit !== undefined ? { unit: item.unit } : {}),
  qty: item.qty,
  priceAtMoment: item.priceAtMoment,
  ...(item.is_variable_weight !== undefined ? { is_variable_weight: item.is_variable_weight } : {}),
  ...(item.kilosRequested !== undefined ? { kilosRequested: item.kilosRequested } : {}),
  ...(item.kilosReal !== undefined ? { kilosReal: item.kilosReal } : {}),
  ...(item.substitutedFor !== undefined ? { substitutedFor: item.substitutedFor } : {}),
  ...(item.picked === true ? { picked: true as const } : {}),
})

const toDeliveryDataDto = (data: DeliveryDataDto): DeliveryDataDto => ({
  ...(data.address !== undefined ? { address: data.address } : {}),
  ...(data.lat !== undefined ? { lat: data.lat } : {}),
  ...(data.lng !== undefined ? { lng: data.lng } : {}),
  ...(data.timeSlot !== undefined ? { timeSlot: data.timeSlot } : {}),
})

/**
 * Proyección explícita (lista blanca) del modelo interno al DTO público, validada con el
 * esquema compartido antes de salir: no filtra `storeId`, `updatedBy` ni props extra de ítems/entrega.
 * Lanza `ZodError` si un pedido persistido no cumple el contrato (la API responde 500, no
 * datos inválidos).
 */
export const toOrderDto = (order: Order): OrderDto =>
  orderDtoSchema.parse({
    orderId: order.id,
    userId: order.customerId,
    status: order.status,
    items: order.items.map(toItemDto),
    deliveryType: order.deliveryType,
    deliveryData: toDeliveryDataDto(order.deliveryData),
    substitutionPreference: order.substitutionPreference,
    customerName: order.customerName,
    ...(order.customerPhone !== undefined ? { customerPhone: order.customerPhone } : {}),
    ...(order.shippingCost !== undefined ? { shippingCost: order.shippingCost } : {}),
    estimatedTotal: order.estimatedTotal,
    ...(order.finalTotal !== undefined ? { finalTotal: order.finalTotal } : {}),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    version: order.version,
    ...(order.originalItems !== undefined ? { originalItems: order.originalItems.map(toItemDto) } : {}),
    ...(order.cancellationReason !== undefined ? { cancellationReason: order.cancellationReason } : {}),
    ...(order.cancelledAt !== undefined ? { cancelledAt: order.cancelledAt } : {}),
    ...(order.processingNotice !== undefined ? { processingNotice: order.processingNotice } : {}),
    ...(order.timeSlotDate !== undefined ? { timeSlotDate: order.timeSlotDate } : {}),
    ...(order.reference !== undefined ? { reference: order.reference } : {}),
    paymentMethod: order.paymentMethod,
  })

/** Página del listado: cada pedido sale por el mismo DTO canónico que el detalle. */
export const toOrderListResponse = (page: { items: Order[]; nextCursor: string | null }): OrderListResponse =>
  orderListResponseSchema.parse({ items: page.items.map(toOrderDto), nextCursor: page.nextCursor })

/** Respuesta de creación: el pedido nace siempre en `received`. */
export const toOrderConfirmation = (order: Order): OrderConfirmationDto =>
  orderConfirmationSchema.parse({
    orderId: order.id,
    status: 'received',
    estimatedTotal: order.estimatedTotal,
    ...(order.processingNotice !== undefined ? { processingNotice: order.processingNotice } : {}),
    ...(order.timeSlotDate !== undefined ? { timeSlotDate: order.timeSlotDate } : {}),
    ...(order.reference !== undefined ? { reference: order.reference } : {}),
  })

/**
 * Respuestas según el contrato negociado (`contractVersionFrom`): v2 completo o la forma v1 exacta que
 * siguen validando las apps anteriores. Siempre se valida primero el DTO v2.
 */
export const toOrderDtoFor = (order: Order, version: ContractVersion): OrderDto =>
  version === 2 ? toOrderDto(order) : toV1OrderDto(toOrderDto(order))

export const toOrderListResponseFor = (page: { items: Order[]; nextCursor: string | null }, version: ContractVersion): OrderListResponse =>
  version === 2 ? toOrderListResponse(page) : toV1OrderList(toOrderListResponse(page))

export const toOrderConfirmationFor = (order: Order, version: ContractVersion): OrderConfirmationDto =>
  version === 2 ? toOrderConfirmation(order) : toV1OrderConfirmation(toOrderConfirmation(order))
