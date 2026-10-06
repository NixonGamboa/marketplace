import { Link } from 'react-router-dom'
import { orderReferenceLabel } from '@shared/receipts'
import type { AdminOrder } from '@/types/adminOrder'
import { phoneLast4 } from '@/lib/phone'
import { StatusBadge } from './StatusBadge'
import { ORDER_STATUS_LABELS } from './orderPresentation'

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

function formatTime(isoString: string): string {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(isoString),
  )
}

interface OrderRowProps {
  order: AdminOrder
  activeStatus: string
}

export function OrderRow({ order, activeStatus }: OrderRowProps) {
  const phoneSuffix = order.customerPhone
    ? ` · …${phoneLast4(order.customerPhone)}`
    : ''

  // Pulso sutil para pedidos received en el tab activo (AC-7)
  const isPulse = order.status === 'received' && activeStatus === 'received'

  return (
    <li>
      <Link
        to={`/pedidos/${order.orderId}`}
        className="flex items-center justify-between gap-3 bg-white border border-gray-200 hover:border-indigo-200 hover:shadow-sm rounded-xl px-4 py-3 transition"
        aria-label={`${orderReferenceLabel(order)} de ${order.customerName}, estado ${ORDER_STATUS_LABELS[order.status]}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Dot de pulso para received */}
          {isPulse && (
            <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500 animate-pulse" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {order.customerName}{phoneSuffix}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{orderReferenceLabel(order)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={order.status} />
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-gray-700">
              {currencyFormatter.format(order.estimatedTotal)}
            </p>
            <p className="text-xs text-gray-400">{formatTime(order.createdAt)}</p>
          </div>
        </div>
      </Link>
    </li>
  )
}
