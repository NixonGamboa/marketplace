import type { OrderService, OrderPayload, Order } from '@/types/orderService'
import { DEMO_USER } from '@/config/app'

const STORAGE_KEY = 'maui-orders'
const SEED_MARKER_KEY = 'maui-orders-seeded-v1'

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

// ── Seed mock history para el usuario demo ────────────────────────────────────
// Se ejecuta una sola vez (marker en localStorage). Los pedidos cubren los
// estados clave (delivered, ready, preparing) y ambas modalidades (delivery,
// pickup) para que el historial luzca realista en la demo.

function buildDemoSeedOrders(): Order[] {
  const now = Date.now()
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()
  const daysAgo  = (d: number) => new Date(now - d * 24 * 3_600_000).toISOString()

  // ── Pedido 1 — entregado hace 5 días, domicilio ─────────────────────────────
  const order1Items = [
    { id: 'leche-entera-1l',         qty: 2, priceAtMoment: 4500 },
    { id: 'yogurt-natural-1l',       qty: 1, priceAtMoment: 8200 },
    { id: 'frijol-bola-roja-500g',   qty: 1, priceAtMoment: 4200 },
    { id: 'arroz-1kg',               qty: 1, priceAtMoment: 5500 },
  ]

  // ── Pedido 2 — entregado hace 2 días, pickup mañana ─────────────────────────
  const order2Items = [
    { id: 'chorizo-250g',            qty: 2, priceAtMoment: 9000 },
    { id: 'queso-campesino-250g',    qty: 1, priceAtMoment: 7500 },
    { id: 'gaseosa-cola-2l',         qty: 1, priceAtMoment: 6500 },
  ]

  // ── Pedido 3 — preparando, hace 1.5 horas, domicilio ────────────────────────
  const order3Items = [
    { id: 'aceite-girasol-1l',       qty: 1, priceAtMoment: 12000 },
    { id: 'salchichas-viena-250g',   qty: 2, priceAtMoment: 7800 },
    { id: 'atun-lata-170g',          qty: 3, priceAtMoment: 5500 },
  ]

  return [
    {
      orderId:                'MAUI-DEMO-0001',
      userId:                 DEMO_USER.id,
      status:                 'delivered',
      items:                  order1Items,
      deliveryType:           'delivery',
      deliveryData: {
        address: 'Calle 8 # 5-32, Dolores, Tolima',
        lat:     3.5402,
        lng:     -74.8965,
      },
      substitutionPreference: 'similar',
      customerName:           DEMO_USER.name,
      estimatedTotal:         calculateTotal(order1Items),
      createdAt:              daysAgo(5),
      updatedAt:              new Date(now - 5 * 24 * 3_600_000 + 90 * 60_000).toISOString(),
    },
    {
      orderId:                'MAUI-DEMO-0002',
      userId:                 DEMO_USER.id,
      status:                 'delivered',
      items:                  order2Items,
      deliveryType:           'pickup',
      deliveryData: {
        timeSlot: 'morning',
      },
      substitutionPreference: 'call_me',
      customerName:           DEMO_USER.name,
      estimatedTotal:         calculateTotal(order2Items),
      createdAt:              daysAgo(2),
      updatedAt:              new Date(now - 2 * 24 * 3_600_000 + 120 * 60_000).toISOString(),
    },
    {
      orderId:                'MAUI-DEMO-0003',
      userId:                 DEMO_USER.id,
      status:                 'preparing',
      items:                  order3Items,
      deliveryType:           'delivery',
      deliveryData: {
        address: 'Carrera 10 # 12-08, Dolores, Tolima',
        lat:     3.5421,
        lng:     -74.8979,
      },
      substitutionPreference: 'similar',
      customerName:           DEMO_USER.name,
      estimatedTotal:         calculateTotal(order3Items),
      createdAt:              hoursAgo(1.5),
      updatedAt:              hoursAgo(0.25),
    },
  ]
}

function seedDemoOrdersIfNeeded(): void {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(SEED_MARKER_KEY) === '1') return

  const existing = readAllFromStorage()
  const seeds = buildDemoSeedOrders()
  for (const order of seeds) {
    if (!existing[order.orderId]) {
      existing[order.orderId] = order
    }
  }
  writeAllToStorage(existing)
  localStorage.setItem(SEED_MARKER_KEY, '1')
}

// Ejecuta el seed la primera vez que se carga el módulo en el browser.
seedDemoOrdersIfNeeded()

export const mockOrderService: OrderService = {
  async submit(payload) {
    await delay(1200)

    const orderId = `MAUI-${Date.now()}`
    const estimatedTotal = calculateTotal(payload.items)
    const now = new Date().toISOString()

    const order: Order = {
      orderId,
      userId:                 payload.userId,
      status:                 'received',
      items:                  payload.items,
      deliveryType:           payload.deliveryType,
      deliveryData:           payload.deliveryData,
      substitutionPreference: payload.substitutionPreference,
      customerName:           payload.customerName,
      estimatedTotal,
      createdAt:              now,
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

  async list(userId) {
    await delay(600)
    const orders = Object.values(readAllFromStorage())
    const filtered = userId ? orders.filter((o) => o.userId === userId) : orders
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
}
