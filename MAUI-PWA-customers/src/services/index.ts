export { fetchJson, BASE_URL } from './api'

import type { OrderService } from '../types/orderService'
import { mockOrderService } from './mockOrderService'
import { realOrderService } from './realOrderService'

export { realAuthService } from './realAuthService'
export { realCatalogService } from './realCatalogService'
export { checkoutErrorMessage } from './checkoutErrorMessage'
export { ApiError } from './http/apiError'

// Demo conserva los mocks; en modo real no hay respaldo local: errores y sesión vienen del servidor.
export const orderService: OrderService =
  import.meta.env.VITE_DEMO_MODE === 'true' ? mockOrderService : realOrderService
