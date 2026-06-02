import type { Order, OrderStatus } from '@/types/order'

const STORAGE_KEY = 'maui-orders'

function readAll(): Record<string, Order> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Order>) : {}
  } catch { return {} }
}

function writeAll(orders: Record<string, Order>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
}

export function getOrders(): Order[] {
  return Object.values(readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getOrderById(orderId: string): Order | null {
  return readAll()[orderId] ?? null
}

export function updateOrderStatus(orderId: string, newStatus: OrderStatus): Order | null {
  const orders = readAll()
  if (!orders[orderId]) return null
  orders[orderId] = { ...orders[orderId], status: newStatus, updatedAt: new Date().toISOString() }
  writeAll(orders)
  return orders[orderId]
}
