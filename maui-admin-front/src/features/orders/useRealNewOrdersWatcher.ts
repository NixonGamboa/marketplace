import { useEffect, useRef, useState } from 'react'
import type { Order } from '@/types/orderService'
import { orderPages } from '@/services'
import { useSession } from '@/auth/useSession'
import { orderPollingInterval, startOrderPolling } from '@/lib/orderPolling'

/** Baseline sin alertas; cada ID recibido posteriormente alerta una vez por sesión. */
export function useRealNewOrdersWatcher(onNew: (order: Order) => void, enabled: boolean) {
  const { session } = useSession()
  const [error, setError] = useState(false)
  const callback = useRef(onNew)
  callback.current = onNew
  const sessionKey = session ? JSON.stringify([session.user.email, session.user.merchantId, session.expiresAt]) : ''
  useEffect(() => {
    if (!enabled || !sessionKey) { setError(false); return }
    const known = new Set<string>()
    let baseline = true
    const poll = startOrderPolling(async (signal) => {
      const received: Order[] = []
      let cursor: string | undefined
      for (let index = 0; index < 25; index += 1) {
        const page = await orderPages.loadPage({ status: 'received' }, { limit: 100, ...(cursor ? { cursor } : {}) }, { signal })
        if (signal.aborted) return
        received.push(...page.items)
        cursor = page.nextCursor ?? undefined
        if (!cursor) break
      }
      if (cursor) throw new Error('Demasiadas páginas de pedidos recibidos')
      for (const order of received) {
        if (known.has(order.orderId)) continue
        known.add(order.orderId)
        if (!baseline) callback.current(order)
      }
      baseline = false
      setError(false)
    }, () => setError(true), orderPollingInterval())
    return () => poll.stop()
  }, [sessionKey, enabled])
  return error
}
