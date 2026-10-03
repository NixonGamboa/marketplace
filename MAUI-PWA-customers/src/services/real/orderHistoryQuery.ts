// Query del historial de pedidos del cliente: filtros resueltos en el servidor ANTES de paginar.
// Pura y sin red; el esquema compartido valida el resultado antes de enviarlo.

import type { OrderStatus } from '@/types/orderService'
import { ApiError } from '../http/apiError'

export interface OrderHistoryFilter {
  /** Texto libre (ID, nombre o teléfono); el servidor lo interpreta, no se filtra en el cliente. */
  q?: string
  status?: OrderStatus
  /** `YYYY-MM-DD`, día completo inclusive. */
  from?: string
  /** `YYYY-MM-DD`, día completo inclusive. */
  to?: string
}

export interface OrderHistoryPage extends OrderHistoryFilter {
  limit?: number
  cursor?: string
}

/** Colombia no tiene horario de verano: los días de la tienda empiezan a las 00:00 UTC-5. */
const STORE_UTC_OFFSET = '-05:00'
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const startOfStoreDay = (date: string): number => {
  const start = DATE_ONLY.test(date) ? Date.parse(`${date}T00:00:00.000${STORE_UTC_OFFSET}`) : Number.NaN
  if (Number.isNaN(start)) throw new ApiError({ kind: 'invalid_request', message: `Fecha inválida: ${date}` })
  return start
}

/** Query cruda de `GET /api/orders`: `from` inclusivo y `to` exclusivo (día siguiente) en la zona de la tienda. */
export const orderHistoryQueryFrom = (page: OrderHistoryPage | undefined): Record<string, string | number | undefined> => ({
  q: page?.q?.trim() || undefined,
  status: page?.status,
  from: page?.from ? new Date(startOfStoreDay(page.from)).toISOString() : undefined,
  to: page?.to ? new Date(startOfStoreDay(page.to) + DAY_MS).toISOString() : undefined,
  limit: page?.limit,
  cursor: page?.cursor,
})
