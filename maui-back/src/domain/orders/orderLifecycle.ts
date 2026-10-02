import {
  ITEMS_EDITABLE_STATUS,
  MAX_COP_AMOUNT,
  calculateOrderTotals,
  canTransition,
  isTerminalOrderStatus,
  issuesFromZodError,
  orderItemSchema,
  type ContractIssue,
  type OrderItemChange,
  type OrderItemDto,
  type OrderStatus,
} from '../../../../shared/contracts/index.js'
import { isOrderable, type CatalogProduct } from '../catalog/Catalog.js'
import { DomainError, ValidationError } from '../../shared/errors.js'
import type { Order } from './Order.js'

/**
 * Ciclo de vida del pedido (T-12): reglas puras, sin persistencia ni HTTP. Cada cambio devuelve el
 * pedido siguiente con versión +1, `updatedAt` y actor; el adapter lo guarda solo si la fila sigue
 * en la versión y el estado leídos. Cliente, entrega, envío cotizado, `estimatedTotal`, fechas de
 * creación y el snapshot de idempotencia nunca cambian.
 */

/** Otro cambio ganó (versión o estado distintos a los leídos/enviados) → 409. */
export class OrderVersionConflictError extends DomainError {
  constructor() {
    super('El pedido cambió mientras se editaba; recárgalo e intenta de nuevo', 'ORDER_VERSION_CONFLICT')
    this.name = 'OrderVersionConflictError'
  }
}

/** Quién y cuándo: actor de la sesión y reloj del servidor (nunca datos del request). */
export interface OrderChangeContext {
  actorId: string
  now: string
}

export interface StatusChange {
  status: OrderStatus
  /** Obligatorio al cancelar; el contrato ya lo normaliza (recortado, 5–500 caracteres). */
  reason?: string | undefined
}

/** Productos leídos del catálogo de la tienda del pedido para los sustitutos, por ID (`null` = inexistente). */
export type SubstituteCatalog = ReadonlyMap<string, CatalogProduct | null>

type Issue = ContractIssue

const issue = (path: string, message: string): Issue => ({ path, message })

/** Versión +1 y actor; `updatedAt` no retrocede aunque otra instancia tenga el reloj atrasado. */
const stamp = (order: Order, ctx: OrderChangeContext): Pick<Order, 'version' | 'updatedAt' | 'updatedBy'> => ({
  version: order.version + 1,
  updatedAt: ctx.now > order.updatedAt ? ctx.now : order.updatedAt,
  updatedBy: ctx.actorId,
})

const assertNotTerminal = (order: Order): void => {
  if (isTerminalOrderStatus(order.status)) {
    throw new ValidationError(`El pedido está ${order.status} y no admite cambios`, [
      issue('status', 'Pedido terminal: no admite cambios'),
    ])
  }
}

/**
 * Total final (ADR-006, redondeo por línea en gramos) de los ítems vigentes + envío cotizado al
 * pedir, que no se recotiza. Pedidos legacy sin envío guardado suman solo ítems, igual que su
 * estimación legacy. `undefined` mientras falte el peso real de un ítem variable.
 */
const finalTotalOf = (items: readonly OrderItemDto[], shippingCost: number | undefined): number | undefined => {
  const { finalTotal } = calculateOrderTotals(items, shippingCost ?? 0)
  if (finalTotal !== undefined && finalTotal > MAX_COP_AMOUNT) {
    throw new ValidationError(`El total final supera el máximo permitido (${MAX_COP_AMOUNT} COP)`)
  }
  return finalTotal
}

const withFinalTotal = (order: Order, finalTotal: number | undefined): Order => {
  const { finalTotal: _previous, ...rest } = order
  return finalTotal === undefined ? rest : { ...rest, finalTotal }
}

const missingRealWeights = (items: readonly OrderItemDto[]): Issue[] =>
  items.flatMap((item, index) =>
    item.is_variable_weight && item.kilosReal === undefined
      ? [issue(`items.${index}.kilosReal`, 'Falta el peso real')]
      : [],
  )

/**
 * Transición de la máquina común según la modalidad. `ready` exige todos los pesos reales y fija
 * el total final; `cancelled` guarda motivo y fecha. Un pedido terminal no admite ninguna.
 */
export const applyStatusChange = (order: Order, change: StatusChange, ctx: OrderChangeContext): Order => {
  assertNotTerminal(order)
  if (!canTransition(order.status, change.status, order.deliveryType)) {
    throw new ValidationError(
      `Transición inválida de ${order.status} a ${change.status} (${order.deliveryType})`,
      [issue('status', 'Transición no permitida para el estado y la modalidad del pedido')],
    )
  }
  const next: Order = { ...order, status: change.status, ...stamp(order, ctx) }

  if (change.status === 'ready') {
    const missing = missingRealWeights(order.items)
    if (missing.length > 0) {
      throw new ValidationError('Registra el peso real de todos los productos de peso variable antes de marcarlo listo', missing)
    }
    return withFinalTotal(next, finalTotalOf(order.items, order.shippingCost))
  }
  if (change.status === 'cancelled') {
    if (change.reason === undefined) {
      throw new ValidationError('Cancelar requiere un motivo', [issue('reason', 'Cancelar requiere un motivo')])
    }
    return { ...next, cancellationReason: change.reason, cancelledAt: next.updatedAt }
  }
  return next
}

/** El snapshot original no lleva pesos reales: refleja lo que se pidió. */
const asOriginalItem = ({ kilosReal: _real, ...item }: OrderItemDto): OrderItemDto => item

type SubstituteChange = Extract<OrderItemChange, { type: 'substitute' }>

/**
 * Línea sustituta con nombre, unidad, precio y peso variable del catálogo actual de la tienda del
 * pedido; cantidad/kilos siguen las reglas del ítem de creación. Respeta la preferencia del
 * cliente: con `remove` no se reemplaza nada.
 */
const substituteLine = (
  order: Order,
  item: OrderItemDto,
  change: SubstituteChange,
  product: CatalogProduct | null,
): OrderItemDto | Issue[] => {
  if (order.substitutionPreference === 'remove') {
    return [issue('type', 'El cliente pidió quitar los productos agotados sin reemplazo')]
  }
  if (order.items.some((line) => line.id === change.productId)) {
    return [issue('productId', 'El producto ya está en el pedido')]
  }
  if (!product || product.storeId !== order.storeId || !isOrderable(product)) {
    return [issue('productId', 'Producto no disponible')]
  }
  const original = item.substitutedFor ?? item.id
  const parsed = orderItemSchema.safeParse({
    id: product.id,
    name: product.name,
    unit: product.unit,
    priceAtMoment: product.price,
    is_variable_weight: product.isVariableWeight,
    qty: change.qty,
    ...(change.kilosRequested !== undefined ? { kilosRequested: change.kilosRequested } : {}),
    ...(change.kilosReal !== undefined ? { kilosReal: change.kilosReal } : {}),
    // Volver al producto original no es una sustitución.
    ...(product.id !== original ? { substitutedFor: original } : {}),
  })
  return parsed.success ? parsed.data : issuesFromZodError(parsed.error)
}

/**
 * Cambios de ítems en bloque, solo durante la preparación. Todos se validan contra el pedido leído
 * y se aplican juntos o ninguno: pesos reales (solo peso variable), retiro y sustitución. El pedido
 * no puede quedar vacío (para eso se cancela con motivo). La primera sustitución o retiro fija
 * `originalItems`; el total final se recalcula y queda ausente mientras falte un peso real.
 */
export const applyItemChanges = (
  order: Order,
  changes: readonly OrderItemChange[],
  catalog: SubstituteCatalog,
  ctx: OrderChangeContext,
): Order => {
  assertNotTerminal(order)
  if (order.status !== ITEMS_EDITABLE_STATUS) {
    throw new ValidationError(`Los ítems solo se modifican en ${ITEMS_EDITABLE_STATUS}; el pedido está ${order.status}`, [
      issue('status', `Los ítems solo se modifican en ${ITEMS_EDITABLE_STATUS}`),
    ])
  }

  const issues: Issue[] = []
  /** Línea nueva por ID de ítem; `null` = retirada. */
  const replacements = new Map<string, OrderItemDto | null>()
  changes.forEach((change, index) => {
    const at = (field: string): string => `changes.${index}${field ? `.${field}` : ''}`
    const item = order.items.find((line) => line.id === change.itemId)
    if (!item) {
      issues.push(issue(at('itemId'), 'El ítem no está en el pedido'))
      return
    }
    if (change.type === 'weight') {
      if (!item.is_variable_weight) issues.push(issue(at('kilosReal'), 'Solo aplica a productos de peso variable'))
      else replacements.set(item.id, { ...item, kilosReal: change.kilosReal })
      return
    }
    if (change.type === 'remove') {
      replacements.set(item.id, null)
      return
    }
    const line = substituteLine(order, item, change, catalog.get(change.productId) ?? null)
    if (Array.isArray(line)) issues.push(...line.map(({ path, message }) => issue(at(path), message)))
    else replacements.set(item.id, line)
  })
  if (issues.length > 0) throw new ValidationError('Cambios de ítems inválidos', issues)

  const items = order.items.flatMap((item) => {
    const replacement = replacements.get(item.id)
    if (replacement === undefined) return [item]
    return replacement === null ? [] : [replacement]
  })
  if (items.length === 0) {
    throw new ValidationError('El pedido no puede quedar sin ítems; cancélalo con un motivo', [
      issue('changes', 'No se pueden quitar todos los ítems'),
    ])
  }

  const changesLines = changes.some((change) => change.type !== 'weight')
  const originalItems = order.originalItems ?? (changesLines ? order.items.map(asOriginalItem) : undefined)
  const next: Order = {
    ...order,
    items,
    ...(originalItems !== undefined ? { originalItems } : {}),
    ...stamp(order, ctx),
  }
  return withFinalTotal(next, finalTotalOf(items, order.shippingCost))
}
