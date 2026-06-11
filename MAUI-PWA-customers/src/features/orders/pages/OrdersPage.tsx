import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShoppingBag } from 'lucide-react'
import { orderService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import type { Order, OrderStatus } from '@/types/orderService'

// ── Date helper ───────────────────────────────────────────────────────────────

function formatOrderDate(iso: string): string {
  const created = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - created.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)

  if (diffMs < 24 * 3_600_000) {
    if (diffMinutes < 60) {
      return diffMinutes <= 1 ? 'Hace 1 minuto' : `Hace ${diffMinutes} minutos`
    }
    return diffHours === 1 ? 'Hace 1 hora' : `Hace ${diffHours} horas`
  }

  return created.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ── Status badge config ───────────────────────────────────────────────────────

interface BadgeConfig {
  label: string
  className: string
}

const STATUS_BADGE: Record<OrderStatus, BadgeConfig> = {
  received:  { label: 'Recibido',   className: 'bg-blue-100 text-blue-700'     },
  confirmed: { label: 'Confirmado', className: 'bg-yellow-100 text-yellow-700' },
  preparing: { label: 'Preparando', className: 'bg-orange-100 text-orange-700' },
  ready:     { label: 'Listo',      className: 'bg-green-100 text-green-700'   },
  delivered: { label: 'Entregado',  className: 'bg-gray-100 text-gray-600'     },
}

const formatPrice = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)

// ── Skeleton card ─────────────────────────────────────────────────────────────

function OrderCardSkeleton() {
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

function OrderCard({ order }: { order: Order }) {
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const userId = useAuthStore((state) => state.user?.id)

  const {
    data: orders,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['orders', userId],
    queryFn: () => orderService.list(userId),
    staleTime: 0,
    enabled: !!userId,
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-5">
      <h1 className="text-xl font-semibold text-brand-dark mb-4">Mis pedidos</h1>

      {/* Loading */}
      {isLoading && (
        <ul aria-label="Cargando pedidos" className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <OrderCardSkeleton />
            </li>
          ))}
        </ul>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 py-12 text-center"
        >
          <p className="text-brand-muted text-sm">
            No pudimos cargar tus pedidos. Verifica tu conexión e intenta de nuevo.
          </p>
          <button
            onClick={() => refetch()}
            className="px-5 py-2.5 bg-brand-primary text-white rounded-xl font-semibold text-sm hover:bg-brand-primary-dark transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && orders?.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <ShoppingBag size={48} className="text-brand-border" aria-hidden="true" />
          <p className="text-brand-dark font-semibold">Aún no has hecho pedidos</p>
          <p className="text-brand-muted text-sm max-w-xs">
            Cuando realices tu primera compra, aparecerá aquí.
          </p>
          <Link
            to="/"
            className="mt-1 px-6 py-2.5 bg-brand-primary text-white rounded-xl font-semibold text-sm hover:bg-brand-primary-dark transition-colors"
          >
            Ir al catálogo
          </Link>
        </div>
      )}

      {/* Success list */}
      {!isLoading && !error && orders && orders.length > 0 && (
        <ul aria-label="Lista de pedidos" className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.orderId}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
