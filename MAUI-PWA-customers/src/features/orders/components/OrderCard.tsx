import { Link } from 'react-router-dom'
import type { Order } from '@/types/orderService'
import { STATUS_BADGE, formatOrderDate, formatPrice } from './orderDisplay'

// ── Skeleton card ─────────────────────────────────────────────────────────────

export function OrderCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="bg-white rounded-2xl border border-brand-border shadow-card p-5 animate-pulse"
    >
      <div className="h-4 w-44 bg-brand-border/50 rounded mb-2" />
      <div className="h-3 w-24 bg-brand-border/40 rounded mb-3" />
      <div className="h-3 w-36 bg-brand-border/40 rounded mb-3" />
      <div className="h-6 w-24 bg-brand-border/30 rounded-full" />
    </div>
  )
}

// ── Order card ────────────────────────────────────────────────────────────────

export function OrderCard({ order }: { order: Order }) {
  const badge = STATUS_BADGE[order.status]
  const itemCount = order.items.length

  return (
    <Link
      to={`/pedidos/${order.orderId}`}
      className="block bg-white rounded-2xl border border-brand-border shadow-card p-5 min-h-20 hover:border-brand-primary/40 hover:shadow-card-hover hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
      aria-label={`Pedido ${order.orderId}, estado: ${badge.label}`}
    >
      <p className="text-sm font-semibold text-brand-dark truncate">
        Pedido {order.orderId}
      </p>
      <p className="text-xs text-brand-muted mt-0.5">
        {formatOrderDate(order.createdAt)}
      </p>
      <p className="text-sm text-brand-dark mt-2">
        {itemCount} producto{itemCount === 1 ? '' : 's'}
        {' · '}
        <span className="font-medium">{formatPrice(order.estimatedTotal)}</span>
      </p>
      <span
        className={[
          'mt-3 inline-block rounded-full px-3 py-0.5 text-xs font-semibold',
          badge.className,
        ].join(' ')}
      >
        {badge.label}
      </span>
    </Link>
  )
}
