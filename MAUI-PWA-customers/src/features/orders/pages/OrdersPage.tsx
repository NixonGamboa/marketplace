import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShoppingBag } from 'lucide-react'
import { orderService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { OrderCard, OrderCardSkeleton } from '../components/OrderCard'

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
