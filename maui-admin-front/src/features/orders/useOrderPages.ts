import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminOrder } from '@/types/adminOrder'
import { orderPages, isDemoMode } from '@/services'
import type { OrderListFilterInput } from '@/services/real/adapters'
import { errorMessage, isAbort } from '@/lib/errorMessage'
import { latestOrderList, orderPollingInterval, startOrderPolling } from '@/lib/orderPolling'
import { useSession } from '@/auth/useSession'

export interface OrderPagesState {
  orders: AdminOrder[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore(): void
  reload(): void
}

export function useOrderPages(filter: OrderListFilterInput, pageSize?: number): OrderPagesState {
  const { session } = useSession()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const generation = useRef(0)
  const loadedPages = useRef(1)
  const key = JSON.stringify([filter.status ?? null, filter.q ?? null, filter.from ?? null, filter.to ?? null])
  const filterRef = useRef(filter)
  filterRef.current = filter
  const sessionKey = session ? JSON.stringify([session.user.email, session.user.merchantId, session.expiresAt]) : ''
  const previousKey = useRef('')

  useEffect(() => {
    const round = ++generation.current
    const scope = key + sessionKey
    if (previousKey.current !== scope) {
      setOrders([])
      loadedPages.current = 1
      previousKey.current = scope
    }
    if (!isDemoMode && !sessionKey) { setOrders([]); setLoading(false); return }
    let stopped = false
    let first = true
    setLoading(true)
    setLoadingMore(false)
    const poll = startOrderPolling(async (signal) => {
      if (busy.current) return
      busy.current = true
      const items: AdminOrder[] = []
      let cursor: string | undefined
      try {
        for (let index = 0; index < loadedPages.current; index += 1) {
          const page = await orderPages.loadPage(filterRef.current,
            pageSize || cursor ? { ...(pageSize ? { limit: pageSize } : {}), ...(cursor ? { cursor } : {}) } : undefined,
            { signal })
          if (stopped || signal.aborted) return
          items.push(...page.items)
          cursor = page.nextCursor ?? undefined
          if (!cursor) break
        }
        setOrders((current) => latestOrderList(current, items))
        setNextCursor(cursor ?? null)
        setError(null)
        first = false
      } finally {
        if (generation.current === round) busy.current = false
        if (!stopped && !signal.aborted) { setLoading(false) }
      }
    }, (failure) => {
      if (!stopped && !isAbort(failure)) {
        setError(errorMessage(failure, first ? 'No se pudieron cargar los pedidos.' : 'No pudimos actualizar; mostramos los últimos pedidos recibidos.'))
        setLoading(false)
      }
    }, isDemoMode ? null : orderPollingInterval())
    const pauseMore = () => {
      if (document.visibilityState === 'hidden' || navigator.onLine === false) controllerRef.current?.abort()
    }
    document.addEventListener('visibilitychange', pauseMore)
    window.addEventListener('offline', pauseMore)
    return () => {
      document.removeEventListener('visibilitychange', pauseMore)
      window.removeEventListener('offline', pauseMore)
      stopped = true
      poll.stop()
      controllerRef.current?.abort()
      busy.current = false
    }
  }, [key, sessionKey, pageSize, reloadToken])

  const loadMore = useCallback(() => {
    if (nextCursor === null || busy.current || loading || loadingMore || navigator.onLine === false || document.visibilityState === 'hidden') return
    const round = generation.current
    const controller = new AbortController()
    controllerRef.current = controller
    busy.current = true
    setLoadingMore(true)
    orderPages.loadPage(filterRef.current, {
      cursor: nextCursor, ...(pageSize ? { limit: pageSize } : {}),
    }, { signal: controller.signal }).then((page) => {
      if (controller.signal.aborted) return
      setOrders((current) => latestOrderList(current, [...current, ...page.items]))
      loadedPages.current += 1
      setNextCursor(page.nextCursor)
      setError(null)
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted && !isAbort(failure)) setError(errorMessage(failure, 'No se pudieron cargar más pedidos.'))
    }).finally(() => {
      if (generation.current === round) { busy.current = false; setLoadingMore(false) }
    })
  }, [nextCursor, loading, loadingMore, pageSize])
  // La recarga explícita también descarta requests anteriores por cleanup.
  const reload = useCallback(() => setReloadToken((value) => value + 1), [])
  return { orders, loading, loadingMore, error, hasMore: nextCursor !== null, loadMore, reload }
}
