import type { RateLimitRule } from '../auth/AuthRepository.js'
import type { Order } from './Order.js'
import { z } from 'zod'
import { entityIdSchema, orderDtoSchema } from '../../../../shared/contracts/index.js'
import { DomainError } from '../../shared/errors.js'

export interface OrderCreationIdentity {
  customerId: string
  storeId: string
  keyHash: string
}

export interface StoredOrderCreation {
  fingerprint: string
  /** Snapshot inmutable de creación; los cambios posteriores de estado no alteran el retry. */
  order: Order
}

export interface CommitOrderCreation extends OrderCreationIdentity, StoredOrderCreation {
  storeVersion: number
  products: { id: string; version: number }[]
  quota: RateLimitRule
}

export type CommitOrderResult =
  | { kind: 'created' | 'replayed'; creation: StoredOrderCreation }
  | { kind: 'conflict' }
  | { kind: 'changed' }
  | { kind: 'limited'; retryAfterSeconds: number }

export class IdempotencyConflictError extends DomainError {
  constructor() { super('La clave de idempotencia ya corresponde a otra petición', 'IDEMPOTENCY_KEY_REUSED') }
}

/**
 * Fallo de persistencia de la creación de pedidos (→ 503). No es `DomainError`: el manejador
 * común mapearía ese tipo a 409. No conserva el error original: puede contener URLs, SQL o PII.
 */
export class OrderPersistenceError extends Error {
  readonly code = 'ORDER_PERSISTENCE_UNAVAILABLE'

  constructor() {
    super('La persistencia de pedidos no está disponible')
    this.name = 'OrderPersistenceError'
  }
}

/** Validación runtime del snapshot interno usando el mismo DTO de pedidos. */
export function decodeCreationOrder(value: unknown): Order {
  const internal = z.object({ id: entityIdSchema, storeId: entityIdSchema,
    customerId: entityIdSchema, updatedAt: z.string() }).passthrough().parse(value)
  const { id, storeId, customerId, ...fields } = internal
  const dto = orderDtoSchema.parse({ ...fields, orderId: id, userId: customerId })
  return { id, storeId, customerId, updatedAt: internal.updatedAt,
    customerName: dto.customerName, items: dto.items, status: dto.status,
    deliveryType: dto.deliveryType, deliveryData: dto.deliveryData,
    substitutionPreference: dto.substitutionPreference, estimatedTotal: dto.estimatedTotal,
    createdAt: dto.createdAt,
    // Snapshots anteriores a T-12 no guardaban versión: todo pedido nace en la 1.
    version: dto.version ?? 1,
    ...(dto.customerPhone !== undefined ? { customerPhone: dto.customerPhone } : {}),
    ...(dto.shippingCost !== undefined ? { shippingCost: dto.shippingCost } : {}),
    ...(dto.finalTotal !== undefined ? { finalTotal: dto.finalTotal } : {}),
    ...(dto.processingNotice !== undefined ? { processingNotice: dto.processingNotice } : {}),
    ...(dto.timeSlotDate !== undefined ? { timeSlotDate: dto.timeSlotDate } : {}),
  }
}
