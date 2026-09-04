import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import type { Order } from '@/types/orderService'
import { orderRepo } from '@/services'
import StatusBadge from './StatusBadge'

const MERCHANT_NAME = 'Leche y Miel'
const POLL_INTERVAL_MS = 3000

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) return 'Hace un momento'

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? 'Hace 1 minuto' : `Hace ${diffMinutes} minutos`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return diffHours === 1 ? 'Hace 1 hora' : `Hace ${diffHours} horas`
  }

  const diffDays = Math.floor(diffHours / 24)
  return diffDays === 1 ? 'Hace 1 día' : `Hace ${diffDays} días`
}

export default function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      orderRepo.list().then((next) => {
        if (!cancelled) setOrders(next)
      })
    }
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <section aria-labelledby="orders-heading">
      <div className="flex items-center justify-between mb-6">
        <h2 id="orders-heading" className="text-xl font-bold text-gray-900">
          Pedidos · {MERCHANT_NAME}
        </h2>
        <span className="text-sm text-gray-500 font-medium">
          {orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}
        </span>
      </div>

      {orders.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center"
          role="status"
          aria-live="polite"
        >
          <Inbox size={40} className="text-gray-300" aria-hidden />
          <p className="text-gray-500 text-sm max-w-xs">
            No hay pedidos aún. Cuando un cliente cree un pedido aparecerá aquí.
          </p>
        </div>
      ) : (
        <ul
          className="flex flex-col gap-3"
          role="list"
          aria-live="polite"
          aria-label="Lista de pedidos"
        >
          {orders.map((order) => (
            <li key={order.orderId}>
              <Link
                to={`/pedido/${order.orderId}`}
                className="block rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                aria-label={`Pedido ${order.orderId} de ${order.customerName}, estado ${order.status}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-sm font-semibold text-gray-800 break-all">
                    {order.orderId}
                  </span>
                  <StatusBadge status={order.status} />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                  <span className="font-medium text-gray-900">{order.customerName}</span>
                  <span aria-hidden>·</span>
                  <span>
                    {order.items.length} {order.items.length === 1 ? 'producto' : 'productos'}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="font-medium text-gray-900">
                    {currencyFormatter.format(order.estimatedTotal)}
                  </span>
                </div>

                <p className="mt-2 text-xs text-gray-400">
                  {formatRelativeTime(order.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
