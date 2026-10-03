import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminOrder } from '@/types/adminOrder'
import { orderPages } from '@/services'
import type { OrderListFilterInput } from '@/services/real/adapters'
import { errorMessage, isAbort } from '@/lib/errorMessage'

export interface OrderPagesState {
  orders: AdminOrder[]
  /** Primera página en curso (cambio de filtro o recarga). */
  loading: boolean
  loadingMore: boolean
  /** Mensaje del último fallo; vacío si no hay. `retry` repite la operación que falló. */
  error: string | null
  hasMore: boolean
  loadMore(): void
  reload(): void
}

const filterKey = (filter: OrderListFilterInput): string =>
  JSON.stringify([filter.status ?? null, filter.q ?? null, filter.from ?? null, filter.to ?? null])

/**
 * Pedidos paginados con los filtros aplicados en el servidor ANTES de paginar. Cada cambio de
 * filtro cancela la petición anterior y descarta cualquier respuesta tardía de una página vieja.
 * El cursor es opaco y solo vale con los mismos filtros: se reinicia al cambiarlos.
 */
export function useOrderPages(filter: OrderListFilterInput, pageSize?: number): OrderPagesState {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)
  const filterRef = useRef(filter)
  filterRef.current = filter
  const key = filterKey(filter)

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    orderPages
      .loadPage(filterRef.current, pageSize ? { limit: pageSize } : undefined, { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return
        setOrders(page.items)
        setNextCursor(page.nextCursor)
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || isAbort(failure)) return
        setOrders([])
        setNextCursor(null)
        setError(errorMessage(failure, 'No se pudieron cargar los pedidos.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [key, pageSize, reloadToken])

  const loadMore = useCallback(() => {
    if (nextCursor === null || loading || loadingMore) return
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    setLoadingMore(true)
    setError(null)
    orderPages
      .loadPage(filterRef.current, { cursor: nextCursor, ...(pageSize ? { limit: pageSize } : {}) }, { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return
        setOrders((current) => [...current, ...page.items])
        setNextCursor(page.nextCursor)
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || isAbort(failure)) return
        // La página ya cargada se conserva: solo falla «cargar más» y se puede reintentar.
        setError(errorMessage(failure, 'No se pudieron cargar más pedidos.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMore(false)
      })
  }, [nextCursor, loading, loadingMore, pageSize])

  const reload = useCallback(() => setReloadToken((value) => value + 1), [])

  return { orders, loading, loadingMore, error, hasMore: nextCursor !== null, loadMore, reload }
}
