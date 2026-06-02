import type { OrderService, OrderPayload, Order } from '@/types/orderService'

const STORAGE_KEY = 'maui-orders'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readAllFromStorage(): Record<string, Order> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as Record<string, Order>
  } catch {
    return {}
  }
}

function writeAllToStorage(orders: Record<string, Order>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
}

function calculateTotal(items: OrderPayload['items']): number {
  return items.reduce((sum, item) => sum + item.qty * item.priceAtMoment, 0)
}

export const mockOrderService: OrderService = {
  async submit(payload) {
    await delay(1200)

    const orderId = `MAUI-${Date.now()}`
    const estimatedTotal = calculateTotal(payload.items)
    const now = new Date().toISOString()

    const order: Order = {
      orderId,
      status: 'received',
      items: payload.items,
      deliveryType: payload.deliveryType,
      deliveryData: payload.deliveryData,
      substitutionPreference: payload.substitutionPreference,
      customerName: payload.customerName,
      estimatedTotal,
      createdAt: now,
    }

    const orders = readAllFromStorage()
    orders[orderId] = order
    writeAllToStorage(orders)

    return { orderId, status: 'received', estimatedTotal }
  },

  async getById(orderId) {
    await delay(800)
    const orders = readAllFromStorage()
    const order = orders[orderId]
    if (!order) throw new Error(`Order ${orderId} not found`)
    return order
  },

  async list() {
    await delay(600)
    const orders = readAllFromStorage()
    return Object.values(orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
}
