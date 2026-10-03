import {
  IDEMPOTENCY_KEY_HEADER,
  createOrderRequestSchema,
  idempotencyKeySchema,
  listOrdersQuerySchema,
  orderConfirmationSchema,
  orderDtoSchema,
  orderListResponseSchema,
  updateOrderItemsRequestSchema,
  updateOrderStatusRequestSchema,
  ORDER_LIST_LIMITS,
  type OrderItemChange,
} from '@shared/contracts'
import type { AdminOrder } from '@/types/adminOrder'
import type { OrderConfirmation, OrderPayload } from '@/types/orderService'
import { apiClient, type ApiClient } from './http/apiClient'
import { ApiError } from './http/apiError'
import { validateRequest } from './http/validateRequest'
import { orderListQueryFrom, type OrderListFilterInput, type OrderPageRequest } from './real/adapters'
import type { RequestOptions } from './realAuthRepository'
import type { OrderRepository } from './mockOrderRepository'

export interface OrderPage {
  items: AdminOrder[]
  /** `null` en la última página; opaco y válido solo con los mismos filtros. */
  nextCursor: string | null
}

export interface RealOrderRepository extends OrderRepository {
  /** Una página del histórico (createdAt DESC, desempate por ID), con el cursor del servidor. */
  listPage(filter?: OrderListFilterInput, page?: OrderPageRequest, options?: RequestOptions): Promise<OrderPage>
  /** Creación de cliente con clave de idempotencia estable entre reintentos (el servidor rechaza personal con 403). */
  submit(payload: OrderPayload, idempotencyKey: string, options?: RequestOptions): Promise<OrderConfirmation>
  /** Quitar, sustituir o pesar ítems en bloque (solo en preparación); `expectedVersion` es la versión leída. */
  changeItems(orderId: string, changes: OrderItemChange[], expectedVersion: number): Promise<AdminOrder>
}

/** Las mutaciones exigen la versión que vio el usuario: sin ella no hay control de concurrencia. */
const requireVersion = (expectedVersion: number | undefined): number => {
  if (expectedVersion === undefined) {
    throw new ApiError({ kind: 'invalid_request', message: 'El pedido no trae versión; recárgalo antes de modificarlo.' })
  }
  return expectedVersion
}

const orderPath = (orderId: string): string => `/orders/${encodeURIComponent(orderId)}`

/** Tope de `list()` completo: 25 páginas × 100. Más allá se exige filtrar o paginar con `listPage`. */
const MAX_LIST_PAGES = 25

export const createRealOrderRepository = (client: ApiClient = apiClient): RealOrderRepository => {
  const listPage: RealOrderRepository['listPage'] = async (filter, page, options) => {
    const query = orderListQueryFrom(filter, page)
    // Comprueba la query con el esquema compartido (límites, fechas, cursor) antes de gastar red.
    validateRequest(listOrdersQuerySchema, Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]),
    ))
    return client.request({
      path: '/orders',
      query,
      schema: orderListResponseSchema,
      ...(options?.signal ? { signal: options.signal } : {}),
    })
  }

  const changeItems: RealOrderRepository['changeItems'] = async (orderId, changes, expectedVersion) =>
    client.request({
      method: 'PATCH',
      path: orderPath(orderId),
      body: validateRequest(updateOrderItemsRequestSchema, { expectedVersion, changes }),
      schema: orderDtoSchema,
    })

  return {
    listPage,

    /** Recorre todas las páginas; falla en vez de truncar en silencio. */
    async list(filter) {
      const orders: AdminOrder[] = []
      let cursor: string | undefined
      for (let pageNumber = 0; pageNumber < MAX_LIST_PAGES; pageNumber += 1) {
        const page = await listPage(filter, { limit: ORDER_LIST_LIMITS.maxLimit, ...(cursor ? { cursor } : {}) })
        orders.push(...page.items)
        if (page.nextCursor === null) return orders
        cursor = page.nextCursor
      }
      throw new ApiError({ kind: 'invalid_request', message: 'Hay demasiados pedidos para cargarlos de una vez. Acota las fechas o el estado.' })
    },

    async getById(orderId) {
      return client.request({ path: orderPath(orderId), schema: orderDtoSchema })
    },

    async submit(payload, idempotencyKey, options) {
      return client.request({
        method: 'POST',
        path: '/orders',
        headers: { [IDEMPOTENCY_KEY_HEADER]: validateRequest(idempotencyKeySchema, idempotencyKey) },
        body: validateRequest(createOrderRequestSchema, payload),
        schema: orderConfirmationSchema,
        ...(options?.signal ? { signal: options.signal } : {}),
      })
    },

    /** Transición de la máquina común; actor y tienda salen de la sesión (`by` no viaja). 409 si la versión cambió. */
    async updateStatus(orderId, next, _by, expectedVersion) {
      return client.request({
        method: 'PATCH',
        path: `${orderPath(orderId)}/status`,
        body: validateRequest(updateOrderStatusRequestSchema, { status: next, expectedVersion: requireVersion(expectedVersion) }),
        schema: orderDtoSchema,
      })
    },

    setRealWeights(orderId, weights, _by, expectedVersion) {
      return changeItems(
        orderId,
        weights.map(({ itemId, kilos }) => ({ type: 'weight', itemId, kilosReal: kilos })),
        requireVersion(expectedVersion),
      )
    },

    async cancel(orderId, reason, _by, expectedVersion) {
      return client.request({
        method: 'PATCH',
        path: `${orderPath(orderId)}/status`,
        body: validateRequest(updateOrderStatusRequestSchema, { status: 'cancelled', expectedVersion: requireVersion(expectedVersion), reason }),
        schema: orderDtoSchema,
      })
    },

    changeItems,
  }
}

export const realOrderRepository: RealOrderRepository = createRealOrderRepository()
