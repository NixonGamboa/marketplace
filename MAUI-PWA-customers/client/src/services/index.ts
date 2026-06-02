export { fetchJson, BASE_URL } from './api'

import type { OrderService, OrderPayload, OrderConfirmation, Order } from '../types/orderService'

// TASK-002 creates this file; the import is declared now so the switch compiles
// once mockOrderService exists. TypeScript will report an error until TASK-002 is done.
import { mockOrderService } from './mockOrderService'

// Placeholder for the real backend service (Sprint 1).
// Each method throws until the real implementation is wired in.
const realOrderService: OrderService = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  submit(_payload: OrderPayload): Promise<OrderConfirmation> {
    throw new Error('realOrderService not yet implemented — Sprint 1 backend')
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getById(_orderId: string): Promise<Order> {
    throw new Error('realOrderService not yet implemented — Sprint 1 backend')
  },
  list(): Promise<Order[]> {
    throw new Error('realOrderService not yet implemented — Sprint 1 backend')
  },
}

export const orderService: OrderService =
  import.meta.env.VITE_DEMO_MODE === 'true' ? mockOrderService : realOrderService
