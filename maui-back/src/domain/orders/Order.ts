import type {
  DeliveryDataDto,
  DeliveryType,
  OrderItemDto,
  OrderProcessingNoticeDto,
  OrderStatus,
  PaymentMethod,
  SubstitutionPref,
} from '../../../../shared/contracts/index.js'

export { OrderStatus } from '../../../../shared/contracts/index.js'
export type {
  DeliveryType,
  SubstitutionPref,
} from '../../../../shared/contracts/index.js'

/**
 * Modelo interno del pedido (persistencia/casos de uso). No es el DTO público:
 * incluye `storeId` y usa `id/customerId`; `toOrderDto` lo proyecta al contrato cliente.
 */
export interface Order {
  id: string
  storeId: string
  customerId: string
  customerName: string
  /** Celular canónico; ausente solo en pedidos legacy con teléfono irrecuperable. */
  customerPhone?: string
  items: OrderItemDto[]
  status: OrderStatus
  deliveryType: DeliveryType
  deliveryData: DeliveryDataDto
  substitutionPreference: SubstitutionPref
  /** Método elegido al pedir (ME-01); inmutable. Pedidos anteriores: `cash` (default de la columna). */
  paymentMethod: PaymentMethod
  /**
   * Referencia comercial por tienda (ME-04), asignada por la base de datos al insertar e inmutable.
   * Ausente solo antes de persistir el pedido.
   */
  reference?: number
  /** Snapshot del envío; ausente en pedidos legacy. */
  shippingCost?: number
  /** Estimación original (ítems con peso solicitado + envío). */
  estimatedTotal: number
  /** Total con pesos reales e ítems vigentes; se recalcula en cada cambio de ítems (T-12). */
  finalTotal?: number
  /** ISO UTC. */
  createdAt: string
  updatedAt: string
  /** Concurrencia optimista: 1 al crear (también en filas legacy) y +1 por cada cambio. */
  version: number
  /** Cuenta del personal que hizo el último cambio; ausente si nunca cambió. No sale en el DTO. */
  updatedBy?: string
  /** Ítems tal como se pidieron, fijados en la primera sustitución o retiro. */
  originalItems?: OrderItemDto[]
  /** Motivo y fecha de cancelación; solo en `cancelled` (ausentes en cancelaciones legacy). */
  cancellationReason?: string
  cancelledAt?: string
  /** Sustituciones y retiros aplicados, en orden. Constancia interna para T-13; no sale en el DTO. */
  itemAdjustments?: OrderItemAdjustment[]
  /**
   * Snapshot inmutable fijado al crear el pedido fuera de atención. Vive en el snapshot de
   * creación (`order_creations`), no en una columna de `orders`; los repositorios lo adjuntan al leer.
   */
  processingNotice?: OrderProcessingNoticeDto
  /** Fecha local de la franja elegida, fijada por el servidor al crear; mismo almacenamiento inmutable que el aviso. */
  timeSlotDate?: string
}

/**
 * Registro de un retiro o sustitución de ítem: quién, cuándo y si el personal declaró haber
 * contactado al cliente antes (obligatorio con preferencia `call_me`). Es una declaración del
 * operador autenticado, no una confirmación del cliente ni una verificación externa.
 */
export interface OrderItemAdjustment {
  type: 'remove' | 'substitute'
  /** Línea afectada (producto de `items` antes del cambio). */
  itemId: string
  /** Producto sustituto; solo en `substitute`. */
  productId?: string
  customerContacted: boolean
  /** Cuenta del personal que hizo el cambio. */
  by: string
  /** ISO UTC (igual a `updatedAt` del cambio). */
  at: string
}

/**
 * Tienda destino decidida por el servidor, nunca por el body. El cliente sale del actor
 * autenticado (`OrderActor`), no de este contexto.
 */
export interface OrderContext {
  storeId: string
}

/** Tienda única hasta que T-08 persista la configuración del aliado. */
export const DEFAULT_STORE_ID = 'leche-y-miel'
