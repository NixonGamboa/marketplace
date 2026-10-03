import type { ApiErrorKind } from './apiError'

export interface ApiErrorTelemetry {
  event: 'client_api_error'
  client: 'pwa'
  endpoint: string
  method: string
  kind: ApiErrorKind
  status: number | undefined
  requestId: string
  durationMs: number
}
/** IDs y query nunca entran al log. Solo rutas del catálogo HTTP conocido. */
export const telemetryEndpoint = (path: string): string => {
  if (/^\/orders\/[^/?]+\/status$/.test(path)) return '/orders/:id/status'
  if (/^\/orders\/[^/?]+$/.test(path)) return '/orders/:id'
  if (/^\/catalog\/products\/[^/?]+\/image$/.test(path)) return '/catalog/products/:id/image'
  if (/^\/catalog\/(products|categories)\/[^/?]+$/.test(path)) return `/catalog/${path.split('/')[2]}/:id`
  const known = ['/orders', '/audit', '/health', '/store', '/store/settings', '/catalog', '/catalog/staff', '/catalog/products', '/catalog/categories', '/auth/login', '/auth/logout', '/auth/register', '/auth/session']
  return known.includes(path) ? path : '/unknown'
}
