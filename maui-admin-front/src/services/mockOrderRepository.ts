// Mock OrderRepository — opera sobre `localStorage['maui-orders']` (compartido
// con el PWA). Reemplaza al antiguo `lib/localStorage.ts`.
//
// Detalles relevantes:
// - `setRealWeights` aplica la fórmula RN-3 / ADR-006 para items con
//   `is_variable_weight = true`: `kilosReal * priceAtMoment` (precio por kg).
//   Para items normales el subtotal es `qty * priceAtMoment`.
// - Mutaciones registran evento en el audit log.
// - Delays simulan latencia de red (300–800ms).

import type { OrderStatus, CartItem } from '@/types/orderService'
import type { AdminOrder } from '@/types/adminOrder'
import { randomDelay } from './delay'
import { mockAuditRepository } from './mockAuditRepository'
import { phoneMatchesQuery } from '@/lib/phone'

const STORAGE_KEY = 'maui-orders'

export interface OrderListFilter {
  status?: OrderStatus
  q?: string
  from?: string // ISO date — incluye el día completo
  to?: string   // ISO date — incluye el día completo
}

export interface RealWeightInput {
  itemId: string
  kilos: number
}

export interface OrderRepository {
  list(filter?: OrderListFilter): Promise<AdminOrder[]>
  getById(orderId: string): Promise<AdminOrder>
  updateStatus(orderId: string, next: OrderStatus, by: string): Promise<AdminOrder>
  setRealWeights(orderId: string, weights: RealWeightInput[], by: string): Promise<AdminOrder>
  cancel(orderId: string, reason: string, by: string): Promise<AdminOrder>
}

function readAll(): Record<string, AdminOrder> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as Record<string, AdminOrder>
  } catch {
    return {}
  }
}

function writeAll(orders: Record<string, AdminOrder>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
}

function computeTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    if (item.is_variable_weight && typeof item.kilosReal === 'number') {
      // Items de peso variable: el priceAtMoment se interpreta como precio por kg.
      return sum + item.kilosReal * item.priceAtMoment
    }
    return sum + item.qty * item.priceAtMoment
  }, 0)
}

function matchesText(order: AdminOrder, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  if (order.customerName.toLowerCase().includes(needle)) return true
  if (order.orderId.toLowerCase().includes(needle)) return true
  if (order.customerPhone && phoneMatchesQuery(order.customerPhone, q)) return true
  return false
}

function matchesDateRange(order: AdminOrder, from?: string, to?: string): boolean {
  const createdAt = order.createdAt
  if (from && createdAt < from) return false
  if (to) {
    // `to` viene como YYYY-MM-DD: incluye todo ese día (< día siguiente).
    const inclusiveEnd = to.length === 10 ? `${to}T23:59:59.999Z` : to
    if (createdAt > inclusiveEnd) return false
  }
  return true
}

export const mockOrderRepository: OrderRepository = {
  async list(filter) {
    await randomDelay()
    const orders = Object.values(readAll()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    if (!filter) return orders
    return orders.filter((o) => {
      if (filter.status && o.status !== filter.status) return false
      if (filter.q && !matchesText(o, filter.q)) return false
      if (!matchesDateRange(o, filter.from, filter.to)) return false
      return true
    })
  },

  async getById(orderId) {
    await randomDelay()
    const order = readAll()[orderId]
    if (!order) throw new Error(`Pedido ${orderId} no encontrado`)
    return order
  },

  async updateStatus(orderId, next, by) {
    await randomDelay()
    const orders = readAll()
    const current = orders[orderId]
    if (!current) throw new Error(`Pedido ${orderId} no encontrado`)
    if (current.cancellationReason) {
      throw new Error('No se puede modificar un pedido cancelado (RN-6)')
    }
    if (current.status === 'delivered') {
      throw new Error('No se puede cambiar el estado de un pedido entregado')
    }
    const updated: AdminOrder = { ...current, status: next, updatedAt: new Date().toISOString() }
    orders[orderId] = updated
    writeAll(orders)
    await mockAuditRepository.log({
      user: by,
      action: 'order.status_changed',
      targetId: orderId,
      meta: { from: current.status, to: next },
    })
    return updated
  },

  async setRealWeights(orderId, weights, by) {
    await randomDelay()
    const orders = readAll()
    const current = orders[orderId]
    if (!current) throw new Error(`Pedido ${orderId} no encontrado`)
    const byItemId = new Map(weights.map((w) => [w.itemId, w.kilos]))
    const items = current.items.map((item) => {
      if (!item.is_variable_weight) return item
      const kilosReal = byItemId.get(item.id)
      return typeof kilosReal === 'number' ? { ...item, kilosReal } : item
    })
    const updated: AdminOrder = {
      ...current,
      items,
      estimatedTotal: computeTotal(items),
      updatedAt: new Date().toISOString(),
    }
    orders[orderId] = updated
    writeAll(orders)
    await mockAuditRepository.log({
      user: by,
      action: 'order.weights_set',
      targetId: orderId,
      meta: { weights },
    })
    return updated
  },

  async cancel(orderId, reason, by) {
    if (!reason || !reason.trim()) {
      throw new Error('El motivo de cancelación es obligatorio')
    }
    await randomDelay()
    const orders = readAll()
    const current = orders[orderId]
    if (!current) throw new Error(`Pedido ${orderId} no encontrado`)
    if (current.cancellationReason) {
      throw new Error('El pedido ya estaba cancelado (RN-6)')
    }
    const now = new Date().toISOString()
    const updated: AdminOrder = {
      ...current,
      cancellationReason: reason.trim(),
      cancelledAt: now,
      updatedAt: now,
    }
    orders[orderId] = updated
    writeAll(orders)
    await mockAuditRepository.log({
      user: by,
      action: 'order.cancelled',
      targetId: orderId,
      meta: { reason: reason.trim(), previousStatus: current.status },
    })
    return updated
  },
}

export const realOrderRepository: OrderRepository = {
  list() {
    throw new Error('realOrderRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  getById() {
    throw new Error('realOrderRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  updateStatus() {
    throw new Error('realOrderRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  setRealWeights() {
    throw new Error('realOrderRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  cancel() {
    throw new Error('realOrderRepository not implemented (swap from VITE_DEMO_MODE)')
  },
}
