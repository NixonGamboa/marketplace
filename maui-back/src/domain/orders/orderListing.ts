import type { Order, OrderStatus } from './Order.js'

/**
 * Alcance del listado, decidido SIEMPRE por el servidor a partir del actor autenticado
 * (`listScopeFor`); jamás de la query ni del body.
 */
export type OrderListScope =
  | { kind: 'customer'; customerId: string }
  | { kind: 'store'; storeId: string }

/** Filtros ya validados y normalizados. `from` inclusive, `to` exclusivo (ISO UTC). */
export interface OrderListFilter {
  status?: OrderStatus
  from?: string
  to?: string
  /** Texto literal del contrato (`q`); nunca patrón LIKE ni expresión regular. */
  search?: string
}

/**
 * Posición de una fila en el orden `createdAt DESC, id DESC`. `createdAt` conserva la precisión
 * completa de la columna (6 decimales): redondear a milisegundos haría perder filas del borde.
 */
export interface OrderListPosition {
  /** `YYYY-MM-DDTHH:MM:SS.ffffffZ` */
  createdAt: string
  id: string
}

export interface OrderPageRequest {
  scope: OrderListScope
  filter: OrderListFilter
  limit: number
  /** Devuelve solo filas estrictamente posteriores a esta posición en el orden del listado. */
  after?: OrderListPosition
}

export interface OrderPageEntry {
  order: Order
  position: OrderListPosition
}

export interface OrderPage {
  /** A lo sumo `limit` filas. */
  entries: OrderPageEntry[]
  /** Había al menos una fila más (se consulta `limit + 1`); no se hace COUNT. */
  hasMore: boolean
}

/** Mínimo de dígitos para que `q` también busque por teléfono; menos sería ruido. */
export const SEARCH_PHONE_MIN_DIGITS = 3

/** Dígitos para buscar por teléfono, o `null` si `q` no tiene forma de teléfono. */
export const phoneDigitsFromSearch = (search: string): string | null => {
  if (!/^\+?[\d\s()-]+$/.test(search)) return null
  const digits = search.replace(/\D/g, '')
  return digits.length >= SEARCH_PHONE_MIN_DIGITS ? digits : null
}

const MICROSECOND_ISO = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/

/** Posición con 6 decimales fijos a partir de un ISO UTC (la comparación textual es cronológica). */
export const toListPosition = (createdAt: string, id: string): OrderListPosition => {
  const match = MICROSECOND_ISO.exec(createdAt)
  if (!match) throw new RangeError(`Timestamp inválido: ${createdAt}`)
  return { createdAt: `${match[1]}.${(match[2] ?? '').padEnd(6, '0')}Z`, id }
}

/** Reglas de filtrado del adapter en memoria; el adapter SQL las expresa en la consulta. */
export const matchesOrderFilter = (order: Order, scope: OrderListScope, filter: OrderListFilter): boolean => {
  if (scope.kind === 'customer' ? order.customerId !== scope.customerId : order.storeId !== scope.storeId) return false
  if (filter.status !== undefined && order.status !== filter.status) return false
  const created = Date.parse(order.createdAt)
  if (filter.from !== undefined && created < Date.parse(filter.from)) return false
  if (filter.to !== undefined && created >= Date.parse(filter.to)) return false
  if (filter.search === undefined) return true

  const needle = filter.search.toLowerCase()
  const digits = phoneDigitsFromSearch(filter.search)
  return (
    order.id.toLowerCase().startsWith(needle) ||
    order.customerName.toLowerCase().includes(needle) ||
    (digits !== null && (order.customerPhone ?? '').replace(/\D/g, '').includes(digits))
  )
}
