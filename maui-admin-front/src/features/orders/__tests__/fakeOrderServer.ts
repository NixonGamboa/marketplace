/**
 * Servidor de pedidos en memoria para pruebas de comportamiento (no es evidencia de cierre contra API/Postgres).
 * Reproduce las reglas del contrato que la UI debe respetar: versión optimista (409), un peso válido marca la
 * línea, borrarlo la desmarca, desmarcar conserva el peso, el sustituto entra sin marcar, «Listo» exige todo
 * alistado y «Reabrir» conserva marcas, pesos y total.
 */
import { vi, type Mock } from 'vitest'
import { calculateOrderTotals, canTransition, pendingPickItems, type OrderItemChange, type OrderItemDto } from '@shared/contracts'
import type { AdminOrder } from '@/types/adminOrder'
import type { OrderStatus } from '@/types/orderService'
import { ApiError } from '@/services/http/apiError'

export const conflict = () => new ApiError({ kind: 'conflict', status: 409, message: 'El pedido cambió. Recarga e intenta de nuevo.' })
const invalid = (message: string) => new ApiError({ kind: 'validation', status: 400, message })

const withoutPick = ({ picked: _picked, ...item }: OrderItemDto): OrderItemDto => item

function changeLine(item: OrderItemDto, change: OrderItemChange): OrderItemDto {
  if (change.type === 'weight') {
    if (!item.is_variable_weight) throw invalid('El peso real solo aplica a productos de peso variable')
    const { kilosReal: _kilos, ...rest } = withoutPick(item)
    return change.kilosReal === null ? rest : { ...rest, kilosReal: change.kilosReal, picked: true }
  }
  if (change.type === 'pick') {
    if (!change.picked) return withoutPick(item)
    if (item.is_variable_weight && item.kilosReal === undefined) throw invalid('Registra el peso real para alistar este producto')
    return { ...item, picked: true }
  }
  return item
}

const recalculated = (order: AdminOrder): AdminOrder => {
  const { finalTotal: _previous, ...rest } = order
  const total = calculateOrderTotals(order.items, order.shippingCost ?? 0).finalTotal
  return total === undefined ? rest : { ...rest, finalTotal: total }
}

export interface FakeOrderServer {
  /** Estado persistido en el servidor. */
  current(): AdminOrder
  /** Cambio hecho por otra persona: aplica y sube la versión sin pasar por la UI. */
  byAnotherOperator(change: OrderItemChange | OrderItemChange[]): void
  /** Hace fallar la próxima escritura de ítems (red, 503…). */
  failNextChange(error: Error): void
  /** Retrasa la próxima escritura de ítems hasta llamar a `release`. */
  holdNextChange(): { release(): void }
  /** La próxima escritura de ítems SE APLICA en el servidor, pero su respuesta llega al cliente solo al llamar a `release`. */
  holdNextResponse(): { release(): void }
  repo: {
    getById: Mock<(orderId: string) => Promise<AdminOrder>>
    changeItems: Mock<(orderId: string, changes: OrderItemChange[], expectedVersion?: number) => Promise<AdminOrder>>
    updateStatus: Mock<(orderId: string, next: OrderStatus, by: string, expectedVersion?: number) => Promise<AdminOrder>>
    cancel: Mock<(orderId: string, reason: string, by: string, expectedVersion?: number) => Promise<AdminOrder>>
  }
}

export function createFakeOrderServer(initial: AdminOrder): FakeOrderServer {
  let order: AdminOrder = { version: 1, ...initial }
  let failure: Error | null = null
  let gate: Promise<void> | null = null
  let responseGate: Promise<void> | null = null

  const apply = (changes: OrderItemChange[]): void => {
    let items = order.items
    let originalItems = order.originalItems
    for (const change of changes) {
      const target = items.find((item) => item.id === change.itemId)
      if (!target) throw invalid('El ítem no está en el pedido')
      if (change.type === 'remove') {
        originalItems ??= order.items
        items = items.filter((item) => item.id !== target.id)
      } else if (change.type === 'substitute') {
        originalItems ??= order.items
        const substitute: OrderItemDto = {
          id: change.productId,
          name: `Sustituto ${change.productId}`,
          qty: change.qty,
          priceAtMoment: target.priceAtMoment,
          substitutedFor: target.substitutedFor ?? target.id,
        }
        items = items.map((item) => (item.id === target.id ? substitute : item))
      } else {
        items = items.map((item) => (item.id === target.id ? changeLine(item, change) : item))
      }
    }
    order = recalculated({ ...order, items, ...(originalItems ? { originalItems } : {}), version: (order.version ?? 1) + 1 })
  }

  const requireVersion = (expected: number | undefined): void => {
    if (expected !== order.version) throw conflict()
  }

  const repo: FakeOrderServer['repo'] = {
    getById: vi.fn(async (_orderId: string) => structuredClone(order)),
    changeItems: vi.fn(async (_orderId: string, changes: OrderItemChange[], expectedVersion?: number) => {
      if (gate) await gate
      if (failure) {
        const error = failure
        failure = null
        throw error
      }
      requireVersion(expectedVersion)
      if (order.status !== 'preparing') throw invalid('Los ítems solo se modifican en preparación')
      apply(changes)
      const response = structuredClone(order)
      const delayed = responseGate
      responseGate = null
      if (delayed) await delayed
      return response
    }),
    updateStatus: vi.fn(async (_orderId: string, next: OrderStatus, _by: string, expectedVersion?: number) => {
      requireVersion(expectedVersion)
      if (!canTransition(order.status, next, order.deliveryType)) throw invalid('Transición no permitida')
      if (next === 'ready') {
        const pending = pendingPickItems(order.items)
        if (pending.length > 0) throw invalid(`Faltan ${pending.length} productos por alistar`)
      }
      const finalTotal = next === 'ready' || next === 'in_delivery' || next === 'delivered'
        ? calculateOrderTotals(order.items, order.shippingCost ?? 0).finalTotal
        : undefined
      order = { ...order, status: next, version: (order.version ?? 1) + 1, ...(finalTotal !== undefined ? { finalTotal } : {}) }
      return structuredClone(order)
    }),
    cancel: vi.fn(async (_orderId: string, reason: string, _by: string, expectedVersion?: number) => {
      requireVersion(expectedVersion)
      order = { ...order, status: 'cancelled', cancellationReason: reason, cancelledAt: '2026-10-06T12:00:00.000Z', version: (order.version ?? 1) + 1 }
      return structuredClone(order)
    }),
  }

  return {
    current: () => structuredClone(order),
    byAnotherOperator: (change) => apply(Array.isArray(change) ? change : [change]),
    failNextChange: (error) => { failure = error },
    holdNextChange: () => {
      let release!: () => void
      gate = new Promise<void>((resolve) => { release = () => { gate = null; resolve() } })
      return { release }
    },
    holdNextResponse: () => {
      let release!: () => void
      responseGate = new Promise<void>((resolve) => { release = resolve })
      return { release }
    },
    repo,
  }
}
