import {
  IDEMPOTENCY_KEY_HEADER,
  ORDER_LIST_LIMITS,
  createOrderRequestSchema,
  listOrdersQuerySchema,
  type CreateOrderRequest,
  orderConfirmationSchema,
  orderDtoSchema,
  orderListResponseSchema,
} from '@shared/contracts'
import type { Order, OrderConfirmation, OrderPayload, OrderService } from '@/types/orderService'
import { apiClient, type ApiClient } from './http/apiClient'
import { ApiError, defaultMessageFor } from './http/apiError'
import { validateRequest } from './http/validateRequest'
import { createOrderRequestFrom } from './real/adapters'
import { orderHistoryQueryFrom, type OrderHistoryPage } from './real/orderHistoryQuery'
import { createCheckoutIntents, stableStringify, type CheckoutIntents } from './real/checkoutIntent'
import { realAuthService, type RealAuthService, type RequestOptions } from './realAuthService'

export interface OrderPage {
  items: Order[]
  /** `null` en la última página; opaco y válido solo con la misma cuenta. */
  nextCursor: string | null
}

export interface RealOrderService extends OrderService {
  /**
   * Una página del historial propio (createdAt DESC) con el cursor del servidor. Los filtros
   * `q/status/from/to` se validan con el esquema compartido y se aplican en el servidor antes de paginar.
   */
  listPage(page?: OrderHistoryPage, options?: RequestOptions): Promise<OrderPage>
  submit(payload: OrderPayload, options?: RequestOptions): Promise<OrderConfirmation>
}

/** Tope de `list()` completo: 25 páginas × 100. Más allá se falla en vez de truncar en silencio. */
const MAX_LIST_PAGES = 25

/**
 * Rechazos definitivos: el servidor respondió que NO creó el pedido, así que la intención termina.
 * Timeout, red, 429, 5xx o respuesta ilegible dejan el resultado desconocido: se conserva la clave
 * para que el reintento devuelva el pedido original en lugar de duplicarlo.
 */
const isDefinitiveRejection = (error: ApiError): boolean =>
  error.kind === 'validation' ||
  error.kind === 'unauthenticated' ||
  error.kind === 'forbidden' ||
  error.kind === 'not_found' ||
  error.kind === 'conflict' ||
  error.kind === 'payload_too_large'

export const createRealOrderService = (
  client: ApiClient = apiClient,
  auth: RealAuthService = realAuthService,
  intents: CheckoutIntents = createCheckoutIntents(),
): RealOrderService => {
  let inFlight: { fingerprint: string; promise: Promise<OrderConfirmation> } | null = null

  /** La identidad es la sesión del servidor: nada de `userId` de un perfil local. */
  const requireSessionUser = async (options?: RequestOptions): Promise<string> => {
    const session = await auth.ensureSession(options)
    if (session === null) {
      throw new ApiError({ kind: 'unauthenticated', status: 401, message: defaultMessageFor('unauthenticated') })
    }
    return session.user.id
  }

  const send = async (request: CreateOrderRequest, fingerprint: string, options?: RequestOptions): Promise<OrderConfirmation> => {
    const key = await intents.keyFor(fingerprint)
    try {
      const confirmation = await client.request({
        method: 'POST',
        path: '/orders',
        headers: { [IDEMPOTENCY_KEY_HEADER]: key },
        body: request,
        schema: orderConfirmationSchema,
        ...(options?.signal ? { signal: options.signal } : {}),
      })
      intents.settle()
      return confirmation
    } catch (error) {
      // Un 409 (p. ej. IDEMPOTENCY_KEY_REUSED) se propaga tal cual: nunca se presenta como éxito.
      if (error instanceof ApiError && isDefinitiveRejection(error)) intents.settle()
      throw error
    }
  }

  const listPage: RealOrderService['listPage'] = async (page, options) => {
    const query = orderHistoryQueryFrom(page)
    // Misma validación que el handler (límites, fechas, cursor, texto) antes de gastar red.
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

  return {
    listPage,

    async submit(payload, options) {
      const sessionUserId = await requireSessionUser(options)
      if (payload.userId !== sessionUserId) {
        throw new ApiError({ kind: 'forbidden', status: 403, message: 'El pedido no corresponde a tu sesión.' })
      }
      const request = validateRequest(createOrderRequestSchema, createOrderRequestFrom(payload))
      const fingerprint = stableStringify(request)
      // Doble clic mientras la misma intención está en vuelo: mismo resultado, una sola petición.
      if (inFlight?.fingerprint === fingerprint) return inFlight.promise
      const promise = send(request, fingerprint, options).finally(() => {
        if (inFlight?.promise === promise) inFlight = null
      })
      inFlight = { fingerprint, promise }
      return promise
    },

    getById(orderId, options) {
      return client.request({ path: `/orders/${encodeURIComponent(orderId)}`, schema: orderDtoSchema, ...(options?.signal ? { signal: options.signal } : {}) })
    },

    /** El alcance lo fija la sesión del servidor; un `userId` ajeno se rechaza en lugar de ignorarse. */
    async list(userId) {
      const sessionUserId = await requireSessionUser()
      if (userId !== undefined && userId !== sessionUserId) {
        throw new ApiError({ kind: 'forbidden', status: 403, message: 'Solo puedes ver tus propios pedidos.' })
      }
      const orders: Order[] = []
      let cursor: string | undefined
      for (let pageNumber = 0; pageNumber < MAX_LIST_PAGES; pageNumber += 1) {
        const page = await listPage({ limit: ORDER_LIST_LIMITS.maxLimit, ...(cursor ? { cursor } : {}) })
        orders.push(...page.items)
        if (page.nextCursor === null) return orders
        cursor = page.nextCursor
      }
      throw new ApiError({ kind: 'invalid_request', message: 'Tienes demasiados pedidos para cargarlos de una vez.' })
    },
  }
}

export const realOrderService: RealOrderService = createRealOrderService()
