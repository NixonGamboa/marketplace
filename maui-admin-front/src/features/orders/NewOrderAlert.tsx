/**
 * @spec §10, §11, TASK-019 — Banner de pedidos nuevos.
 * Se monta dentro de AppShell. Cada pedido nuevo (status=received)
 * genera una entrada en la cola (máx 5) con auto-dismiss a los 2min.
 * Toca sonido en cada llegada nueva.
 */
import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ShoppingBag } from 'lucide-react'
import { orderReferenceLabel } from '@shared/receipts'
import type { Order } from '@/types/orderService'
import { phoneLast4 } from '@/lib/phone'
import { playNewOrderSound } from '@/lib/audio'
import { isDemoMode } from '@/services'
import { useRealNewOrdersWatcher } from './useRealNewOrdersWatcher'
import { useNewOrdersWatcher } from './useNewOrdersWatcher'

const MAX_QUEUE = 5
const AUTO_DISMISS_MS = 2 * 60 * 1000 // 2 minutos

interface AlertItem {
  id: string
  order: Order
  arrivedAt: number
}

export function NewOrderAlert() {
  const [enabled, setEnabled] = useState(isDemoMode)
  const [queue, setQueue] = useState<AlertItem[]>([])
  const navigate = useNavigate()

  const dismiss = useCallback((id: string) => {
    setQueue((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const onNew = useCallback((order: Order) => {
    playNewOrderSound()
    setQueue((prev) => {
      const item: AlertItem = {
        id: `alert-${order.orderId}`,
        order,
        arrivedAt: Date.now(),
      }
      if (prev.some((alert) => alert.order.orderId === order.orderId)) return prev
      const next = [item, ...prev]
      return next.length > MAX_QUEUE ? next.slice(0, MAX_QUEUE) : next
    })
  }, [])

  useNewOrdersWatcher(onNew, isDemoMode)
  const failed = useRealNewOrdersWatcher(onNew, !isDemoMode && enabled)

  // Auto-dismiss cada 30s (limpia los que superaron los 2min)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setQueue((prev) => prev.filter((a) => now - a.arrivedAt < AUTO_DISMISS_MS))
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (isDemoMode && queue.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-label="Alertas de pedidos nuevos"
      className="flex flex-col gap-2 px-4 pt-2"
    >
      {!isDemoMode && <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setQueue([]) }} />
        Alertas de pedidos nuevos
      </label>}
      {failed && <p role="status" className="text-sm text-amber-800">No pudimos actualizar las alertas. Reintentaremos automáticamente.</p>}
      {queue.map((item) => {
        const { order } = item
        const phoneSuffix = order.customerPhone
          ? ` · …${phoneLast4(order.customerPhone)}`
          : ''

        return (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 bg-indigo-600 text-white rounded-xl px-4 py-2.5 shadow-md text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => navigate(`/pedidos/${order.orderId}`)}
              className="flex items-center gap-2 flex-1 text-left hover:opacity-90 transition"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden />
              <span>
                Nuevo pedido: <strong>{order.customerName}{phoneSuffix}</strong>
                <span className="ml-2 opacity-75 font-normal">{orderReferenceLabel(order)}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Cerrar alerta"
              className="shrink-0 opacity-80 hover:opacity-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
