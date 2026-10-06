import type { OrderListResponse } from './orderList.js'
import type { OrderConfirmationDto, OrderDto, OrderItemDto } from './orders.js'

/**
 * Negociación del contrato de pedidos (ME-01, ME-03, ME-04). Las apps anteriores validan cada
 * respuesta con esquemas `.strict()` que rechazan campos desconocidos, y una PWA en caché puede seguir
 * abierta después del despliegue. Por eso la API envía los campos v2 (`reference`, `paymentMethod` y
 * `picked` por ítem) solo a quien envía esta cabecera con el valor vigente; sin ella, o con otro valor,
 * responde exactamente la forma v1. Las peticiones v1 siguen siendo válidas: lo nuevo es opcional.
 */
export const CONTRACT_VERSION_HEADER = 'X-Maui-Contract'
export const CURRENT_CONTRACT_VERSION = '2'

export type ContractVersion = 1 | 2

/** Valor crudo de la cabecera (Node entrega `string | string[] | undefined`); lo no reconocido es v1. */
export const contractVersionFrom = (header: unknown): ContractVersion =>
  header === CURRENT_CONTRACT_VERSION ? 2 : 1

const toV1Item = ({ picked: _picked, ...item }: OrderItemDto): OrderItemDto => item

/** Forma v1 de un pedido v2 ya validado: quita solo los campos añadidos en v2. */
export const toV1OrderDto = ({ reference: _reference, paymentMethod: _paymentMethod, items, originalItems, ...order }: OrderDto): OrderDto => ({
  ...order,
  items: items.map(toV1Item),
  ...(originalItems !== undefined ? { originalItems: originalItems.map(toV1Item) } : {}),
})

export const toV1OrderConfirmation = ({ reference: _reference, ...confirmation }: OrderConfirmationDto): OrderConfirmationDto =>
  confirmation

export const toV1OrderList = (page: OrderListResponse): OrderListResponse => ({
  items: page.items.map(toV1OrderDto),
  nextCursor: page.nextCursor,
})
