/**
 * Historial real de «Mis pedidos». Los filtros (`q`, estado y rango de fechas) viajan al servidor y
 * se aplican ANTES de paginar con el cursor del servidor: no se descargan todas las páginas para
 * filtrar en el teléfono. La consulta lleva el ID de la cuenta en su clave: ni la caché ni la
 * pantalla mezclan pedidos de otra persona.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { Search, ShoppingBag } from 'lucide-react'
import { ORDER_LIST_LIMITS, ORDER_STATUS_VALUES } from '@shared/contracts'
import { realOrderService, type OrderPage } from '@/services/realOrderService'
import type { OrderHistoryFilter } from '@/services/real/orderHistoryQuery'
import { useOrderPollingAvailability } from '@/shared/hooks/useOrderPollingAvailability'
import { latestOrderList, orderPollingInterval } from '@/lib/orderPolling'
import { ApiError } from '@/services/http/apiError'
import { useAuthStore } from '@/stores/authStore'
import type { OrderStatus } from '@/types/orderService'
import { OrderCard, OrderCardSkeleton } from '../components/OrderCard'
import { STATUS_BADGE } from '../components/orderDisplay'

const PAGE_SIZE = 20

/** Mensaje de la carga del historial: el texto del servidor es seguro; sin él, uno genérico. */
const historyErrorMessage = (error: unknown): string =>
  error instanceof ApiError && error.kind !== 'unauthenticated'
    ? error.message
    : 'No pudimos cargar tus pedidos. Verifica tu conexión e intenta de nuevo.'

export default function RealOrdersPage() {
  const userId = useAuthStore((state) => state.user?.id)
  const expiresAt = useAuthStore((state) => state.sessionExpiresAt)
  const [queryDraft, setQueryDraft] = useState('')
  const [statusDraft, setStatusDraft] = useState<OrderStatus | ''>('')
  const [fromDraft, setFromDraft] = useState('')
  const [toDraft, setToDraft] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  // Filtros aplicados: la lista solo cambia al pulsar «Buscar», nunca al teclear.
  const [filter, setFilter] = useState<OrderHistoryFilter>({})

  const queryKey = ['orders', userId, expiresAt, filter]
  const active = useOrderPollingAvailability(queryKey)
  const orders = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      realOrderService.listPage({ ...filter, limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0,
    enabled: !!userId && active,
    refetchInterval: active ? orderPollingInterval() : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    retry: false,
    structuralSharing: (previous, incoming) => {
      const next = incoming as InfiniteData<OrderPage>
      const known = (previous as InfiniteData<OrderPage> | undefined)?.pages.flatMap((page) => page.items) ?? []
      return { ...next, pages: next.pages.map((page) => ({ ...page, items: latestOrderList(known, page.items) })) }
    },
  })

  const items = latestOrderList([], orders.data?.pages.flatMap((page) => page.items) ?? [])
  const hasFilter = Object.keys(filter).length > 0

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (fromDraft && toDraft && fromDraft > toDraft) {
      setFormError('La fecha «desde» no puede ser posterior a «hasta».')
      return
    }
    setFormError(null)
    const q = queryDraft.trim()
    setFilter({
      ...(q ? { q } : {}),
      ...(statusDraft ? { status: statusDraft } : {}),
      ...(fromDraft ? { from: fromDraft } : {}),
      ...(toDraft ? { to: toDraft } : {}),
    })
  }

  function handleClear() {
    setQueryDraft('')
    setStatusDraft('')
    setFromDraft('')
    setToDraft('')
    setFormError(null)
    setFilter({})
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-5">
      <h1 className="text-xl font-semibold text-brand-dark mb-4">Mis pedidos</h1>

      <form onSubmit={handleSubmit} aria-label="Filtrar pedidos" className="mb-4 flex flex-col gap-3 rounded-2xl border border-brand-border bg-white p-4 shadow-card">
        <div className="relative">
          <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            type="search"
            value={queryDraft}
            maxLength={ORDER_LIST_LIMITS.maxSearchLength}
            onChange={(e) => setQueryDraft(e.target.value)}
            placeholder="Buscar por número de pedido"
            aria-label="Buscar pedidos"
            className="w-full rounded-xl border border-brand-border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-brand-dark">
            Estado
            <select
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value as OrderStatus | '')}
              className="rounded-xl border border-brand-border bg-white px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {ORDER_STATUS_VALUES.map((value) => (
                <option key={value} value={value}>{STATUS_BADGE[value].label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-brand-dark">
            Desde
            <input type="date" value={fromDraft} onChange={(e) => setFromDraft(e.target.value)} className="rounded-xl border border-brand-border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-brand-dark">
            Hasta
            <input type="date" value={toDraft} onChange={(e) => setToDraft(e.target.value)} className="rounded-xl border border-brand-border px-3 py-2 text-sm" />
          </label>
        </div>
        {formError && <p role="alert" className="text-xs font-medium text-red-700">{formError}</p>}
        <div className="flex gap-2">
          <button type="submit" className="flex-1 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-dark transition-colors">
            Buscar
          </button>
          {hasFilter && (
            <button type="button" onClick={handleClear} className="rounded-xl border border-brand-border px-4 py-2.5 text-sm font-medium text-brand-dark hover:bg-gray-50 transition-colors">
              Limpiar
            </button>
          )}
        </div>
      </form>

      {orders.isLoading && (
        <ul aria-label="Cargando pedidos" className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}><OrderCardSkeleton /></li>
          ))}
        </ul>
      )}

      {orders.isError && items.length === 0 && (
        <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-brand-muted text-sm">{historyErrorMessage(orders.error)}</p>
          <button
            onClick={() => void orders.refetch()}
            className="px-5 py-2.5 bg-brand-primary text-white rounded-xl font-semibold text-sm hover:bg-brand-primary-dark transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {!orders.isLoading && !orders.isError && items.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <ShoppingBag size={48} className="text-brand-border" aria-hidden="true" />
          <p className="text-brand-dark font-semibold">
            {hasFilter ? 'No encontramos pedidos con esos filtros' : 'Aún no has hecho pedidos'}
          </p>
          {!hasFilter && (
            <>
              <p className="text-brand-muted text-sm max-w-xs">Cuando realices tu primera compra, aparecerá aquí.</p>
              <Link to="/" className="mt-1 px-6 py-2.5 bg-brand-primary text-white rounded-xl font-semibold text-sm hover:bg-brand-primary-dark transition-colors">
                Ir al catálogo
              </Link>
            </>
          )}
        </div>
      )}

      {items.length > 0 && !active && <p role="status" className="mb-3 text-sm text-amber-800">Actualización pausada; mostramos lo último que supimos.</p>}
      {items.length > 0 && (
        <>
          <ul aria-label="Lista de pedidos" className="flex flex-col gap-3">
            {items.map((order) => (
              <li key={order.orderId}><OrderCard order={order} /></li>
            ))}
          </ul>
          {orders.isError && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {orders.isFetchNextPageError ? 'No pudimos cargar más pedidos.' : historyErrorMessage(orders.error)}
            </p>
          )}
          {orders.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void orders.fetchNextPage({ cancelRefetch: false })}
                disabled={orders.isFetching || !active}
                className="rounded-xl border border-brand-border px-5 py-2.5 text-sm font-semibold text-brand-dark hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {orders.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
