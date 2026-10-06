import { createHash } from 'node:crypto'
import {
  DEFAULT_PAYMENT_METHOD, MAX_COP_AMOUNT, OrderStatus, calculateOrderTotals, createOrderRequestSchema,
  idempotencyKeySchema, issuesFromZodError, orderItemSchema,
} from '../../../../shared/contracts/index.js'
import { AuthorizationError, RateLimitedError } from '../../domain/auth/errors.js'
import type { BucketKeyer } from '../../domain/auth/ports.js'
import type { CatalogRepository } from '../../domain/catalog/CatalogRepository.js'
import { isOrderable } from '../../domain/catalog/Catalog.js'
import type { Order, OrderContext } from '../../domain/orders/Order.js'
import { ORDER_CREATE_BUCKET_SCOPE, ORDER_CREATE_POLICY, assertCanCreateOrder, type OrderActor } from '../../domain/orders/orderAccess.js'
import { IdempotencyConflictError, type StoredOrderCreation } from '../../domain/orders/orderCreation.js'
import type { OrdersRepository } from '../../domain/orders/OrdersRepository.js'
import type { StoreRepository } from '../../domain/store/StoreRepository.js'
import { quoteShipping, resolveOrderReception } from '../../domain/store/storeRules.js'
import type { Clock } from '../../shared/clock.js'
import { ConflictError, ValidationError } from '../../shared/errors.js'
import { newId } from '../../shared/ids.js'
import { getStoreSettings } from '../store/getStore.js'

export interface CreateOrderDeps {
  orders: OrdersRepository
  catalog: Pick<CatalogRepository, 'findProduct'>
  store: Pick<StoreRepository, 'findSettings'>
  clock: Clock
  keys: BucketKeyer
  /** Generador del ID del pedido; el seed de test (T-16) lo fija para que el ID sea determinista. */
  newOrderId?: () => string
  /** Observador de resultado sin datos del pedido; HTTP puede medir creaciones y replays. */
  onCreationOutcome?: (outcome: 'created' | 'replayed') => void
}
const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
/** Hash de la clave de idempotencia tal como se guarda en el claim (`order_creations.key_hash`). */
export const idempotencyKeyHash = hash
/** Orden por unidades de código UTF-16: independiente del locale del runtime. */
const byIdCodeUnits = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
type OrderIntent = ReturnType<typeof createOrderRequestSchema.parse>
/**
 * Huella canónica de la intención de compra: campos legacy ignorados no la cambian. El efectivo (por
 * defecto) no entra, así la huella de un cliente anterior sin método sigue igual; otro método sí la cambia.
 */
export const orderIntentFingerprint = (data: OrderIntent): string => hash(JSON.stringify({
  items: data.items.map(({ id, qty, kilosRequested }) => ({ id, qty, kilosRequested }))
    .sort(byIdCodeUnits),
  substitutionPreference: data.substitutionPreference, deliveryType: data.deliveryType,
  deliveryData: { address: data.deliveryData.address, lat: data.deliveryData.lat,
    lng: data.deliveryData.lng, timeSlot: data.deliveryData.timeSlot },
  customerName: data.customerName, customerPhone: data.customerPhone,
  paymentMethod: data.paymentMethod === DEFAULT_PAYMENT_METHOD ? undefined : data.paymentMethod,
}))
/** El observador no decide el resultado: su fallo no altera la creación ni activa la recuperación. */
const notifyOutcome = (deps: CreateOrderDeps, outcome: 'created' | 'replayed'): void => {
  try { deps.onCreationOutcome?.(outcome) } catch { /* La observabilidad nunca cambia el resultado. */ }
}
const replay = (creation: StoredOrderCreation, fingerprint: string): Order => {
  if (creation.fingerprint !== fingerprint) throw new IdempotencyConflictError()
  return creation.order
}

/** Catálogo autoritativo y commit atómico: validaciones fallidas/retries no consumen cupo. */
export const createOrder = async (
  deps: CreateOrderDeps, actor: OrderActor, input: unknown, context: OrderContext,
  idempotencyKey: unknown,
): Promise<Order> => {
  assertCanCreateOrder(actor)
  const parsed = createOrderRequestSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Invalid order input', issuesFromZodError(parsed.error))
  const data = parsed.data
  if (data.userId !== actor.id) throw new AuthorizationError()
  const key = idempotencyKeySchema.safeParse(idempotencyKey)
  if (!key.success) throw new ValidationError('Idempotency-Key inválida', issuesFromZodError(key.error))
  const identity = { customerId: actor.id, storeId: context.storeId, keyHash: hash(key.data) }
  const fingerprint = orderIntentFingerprint(data)
  const prior = await deps.orders.findCreation(identity)
  if (prior) { const order = replay(prior, fingerprint); notifyOutcome(deps, 'replayed'); return order }

  try {
    const settings = await getStoreSettings(deps, context.storeId)
    const products = await Promise.all(data.items.map(item => deps.catalog.findProduct(context.storeId, item.id)))
    const items = data.items.map((item, index) => {
      const product = products[index]
      if (!product || !isOrderable(product)) {
        throw new ValidationError('Producto no disponible', [{ path: `items.${index}.id`, message: 'Producto no disponible' }])
      }
      const snapshot = orderItemSchema.safeParse({
        id: product.id, name: product.name, unit: product.unit, priceAtMoment: product.price,
        is_variable_weight: product.isVariableWeight, qty: item.qty,
        ...(item.kilosRequested !== undefined ? { kilosRequested: item.kilosRequested } : {}),
      })
      if (!snapshot.success) throw new ValidationError('Cantidad o peso inválidos', issuesFromZodError(snapshot.error))
      return snapshot.data
    })
    const now = deps.clock.nowIso()
    // Recibir no depende del horario: solo fija el aviso de procesamiento (rechaza domicilio deshabilitado o franja incompatible).
    const { processingNotice, timeSlotDate } = resolveOrderReception(settings, { deliveryType: data.deliveryType, timeSlot: data.deliveryData.timeSlot }, new Date(now))
    const subtotal = calculateOrderTotals(items, 0).estimatedTotal
    const { shippingCost } = quoteShipping(settings.delivery, data.deliveryType, subtotal)
    const estimatedTotal = subtotal + shippingCost
    if (estimatedTotal > MAX_COP_AMOUNT) throw new ValidationError(`El total estimado supera el máximo permitido (${MAX_COP_AMOUNT} COP)`)
    const order: Order = {
      id: (deps.newOrderId ?? newId)(), storeId: context.storeId, customerId: actor.id,
      customerName: data.customerName, customerPhone: data.customerPhone, items,
      status: OrderStatus.RECEIVED, deliveryType: data.deliveryType, deliveryData: data.deliveryData,
      substitutionPreference: data.substitutionPreference, paymentMethod: data.paymentMethod ?? DEFAULT_PAYMENT_METHOD,
      shippingCost, estimatedTotal,
      createdAt: now, updatedAt: now, version: 1,
      ...(processingNotice !== undefined ? { processingNotice } : {}),
      ...(timeSlotDate !== undefined ? { timeSlotDate } : {}),
    }
    const result = await deps.orders.createIdempotently({
      ...identity, order, fingerprint, storeVersion: settings.version,
      products: products.flatMap(product => product ? [{ id: product.id, version: product.version }] : []),
      quota: { bucket: deps.keys.key(ORDER_CREATE_BUCKET_SCOPE, actor.id), ...ORDER_CREATE_POLICY },
    })
    if (result.kind === 'conflict') throw new IdempotencyConflictError()
    if (result.kind === 'changed') throw new ConflictError('El catálogo o la tienda cambió; vuelve a intentar')
    if (result.kind === 'limited') throw new RateLimitedError(result.retryAfterSeconds)
    const saved = replay(result.creation, fingerprint)
    notifyOutcome(deps, result.kind)
    return saved
  } catch (error) {
    // Otro request pudo confirmar después de la primera lectura, mientras cambiaba catálogo
    // o se perdía la respuesta. Una sola lectura adicional recupera su creación inmutable.
    // Si esa lectura falla, el error útil es el original, no el de la recuperación.
    const completed = await deps.orders.findCreation(identity).catch(() => null)
    if (completed) { const order = replay(completed, fingerprint); notifyOutcome(deps, 'replayed'); return order }
    throw error
  }
}
