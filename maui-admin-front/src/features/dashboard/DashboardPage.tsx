/**
 * @spec CU-6, US-6, TASK-015 — Dashboard con métricas del día.
 * Muestra 5 cards de status, ticket promedio de entregados, y alertas activas
 * (pedidos received con más de 5 minutos sin atender).
 * Se actualiza cuando llegan pedidos nuevos via storage event.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Inbox } from 'lucide-react'
import type { OrderStatus } from '@/types/orderService'
import type { AdminOrder } from '@/types/adminOrder'
import { orderRepo } from '@/services'
import { Spinner } from '@/ui/Spinner'
import { EmptyState } from '@/ui/EmptyState'
import { useNewOrdersWatcher } from '@/features/orders/useNewOrdersWatcher'
import { phoneLast4 } from '@/lib/phone'

const ALERT_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutos

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Recibidos',
  confirmed: 'Confirmados',
  preparing: 'Preparando',
  ready: 'Listos',
  delivered: 'Entregados',
}

const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  received:  { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'   },
  confirmed: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  preparing: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  ready:     { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200'  },
  delivered: { bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200'   },
}

const ORDERED_STATUSES: OrderStatus[] = ['received', 'confirmed', 'preparing', 'ready', 'delivered']

/** Devuelve true si `isoString` corresponde al día de hoy en hora local. */
function isToday(isoString: string): boolean {
  const d = new Date(isoString)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function DashboardPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const all = await orderRepo.list()
      setOrders(all as AdminOrder[])
    } catch {
      // error silencioso en demo — dashboard muestra datos vacíos
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Actualizar cuando lleguen pedidos nuevos desde otras pestañas
  const onNew = useCallback(() => { load() }, [load])
  useNewOrdersWatcher(onNew)

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size={32} />
      </div>
    )
  }

  const todayOrders = orders.filter((o) => isToday(o.createdAt))

  // Conteos por status para hoy
  const counts = ORDERED_STATUSES.reduce<Record<OrderStatus, number>>(
    (acc, s) => {
      acc[s] = todayOrders.filter((o) => o.status === s).length
      return acc
    },
    {} as Record<OrderStatus, number>,
  )

  // Ticket promedio de entregados hoy
  const delivered = todayOrders.filter((o) => o.status === 'delivered')
  const avgTicket = delivered.length > 0
    ? delivered.reduce((sum, o) => sum + o.estimatedTotal, 0) / delivered.length
    : 0

  // Alertas: received con más de 5 min sin atender
  const now = Date.now()
  const alerts = todayOrders.filter(
    (o) => o.status === 'received' && now - new Date(o.createdAt).getTime() > ALERT_THRESHOLD_MS,
  )

  const timeFormatter = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' })

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-5">Dashboard del día</h1>

      {/* Cards de status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {ORDERED_STATUSES.map((status) => {
          const { bg, text, border } = STATUS_COLORS[status]
          return (
            <div
              key={status}
              className={`rounded-xl border ${border} ${bg} p-4 flex flex-col gap-1`}
            >
              <p className={`text-2xl font-bold ${text}`}>{counts[status]}</p>
              <p className={`text-xs font-medium ${text} opacity-80`}>{STATUS_LABELS[status]}</p>
            </div>
          )
        })}
      </div>

      {/* Ticket promedio */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Ticket promedio (entregados hoy)
        </p>
        <p className="text-2xl font-bold text-gray-900">
          {delivered.length > 0 ? currencyFormatter.format(avgTicket) : '—'}
        </p>
        {delivered.length > 0 && (
          <p className="text-xs text-gray-400 mt-0.5">
            sobre {delivered.length} {delivered.length === 1 ? 'pedido' : 'pedidos'}
          </p>
        )}
      </div>

      {/* Alertas activas */}
      <section aria-labelledby="alerts-heading">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-5 h-5 text-amber-500" aria-hidden />
          <h2 id="alerts-heading" className="text-base font-semibold text-gray-800">
            Alertas activas
          </h2>
          {alerts.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-semibold bg-amber-500 text-white">
              {alerts.length}
            </span>
          )}
        </div>

        {alerts.length === 0 ? (
          <EmptyState
            icon={<Inbox size={32} />}
            title="Sin alertas activas"
            description="No hay pedidos recibidos sin atender por más de 5 minutos."
          />
        ) : (
          <ul className="flex flex-col gap-2" role="list">
            {alerts.map((order) => {
              const phoneSuffix = order.customerPhone
                ? ` · …${phoneLast4(order.customerPhone)}`
                : ''
              return (
                <li key={order.orderId}>
                  <Link
                    to={`/pedidos/${order.orderId}`}
                    className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:border-amber-300 transition"
                  >
                    <div>
                      <p className="text-sm font-semibold text-amber-900">
                        {order.customerName}{phoneSuffix}
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5">{order.orderId}</p>
                    </div>
                    <p className="text-xs text-amber-600 shrink-0">
                      {timeFormatter.format(new Date(order.createdAt))}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
