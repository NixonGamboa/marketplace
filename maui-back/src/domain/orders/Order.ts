import type {
  DeliveryDataDto,
  DeliveryType,
  OrderItemDto,
  OrderStatus,
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
