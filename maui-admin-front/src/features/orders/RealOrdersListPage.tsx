/**
 * Lista de pedidos del modo real: la pestaña (estado) y la búsqueda se resuelven en el servidor
 * ANTES de paginar (`GET /api/orders?status&q&cursor`). No descarga el histórico para filtrarlo
 * en el navegador, así que no muestra conteos por pestaña (el servidor no los entrega).
 */
import { useEffect, useRef, useState } from 'react'
import { Search, Inbox } from 'lucide-react'
import type { OrderStatus } from '@/types/orderService'
import { ORDER_LIST_LIMITS } from '@shared/contracts'
import { Spinner } from '@/ui/Spinner'
import { Tabs } from '@/ui/Tabs'
import { OrderRow } from './OrderRow'
import { useOrderPages } from './useOrderPages'

const DEBOUNCE_MS = 300

const TAB_STATUSES: OrderStatus[] = ['received', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'cancelled']

const STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Recibidos',
  confirmed: 'Confirmados',
  preparing: 'Preparando',
  ready: 'Listos',
  in_delivery: 'En camino',
  delivered: 'Entregados',
  cancelled: 'Cancelados',
}

export function RealOrdersListPage() {
  const [status, setStatus] = useState<OrderStatus>('received')
  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { orders, loading, loadingMore, error, hasMore, loadMore, reload } = useOrderPages({
    status,
    ...(query ? { q: query } : {}),
  })

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setRawQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(value.trim()), DEBOUNCE_MS)
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Pedidos</h1>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
        <input
          type="search"
          value={rawQuery}
          maxLength={ORDER_LIST_LIMITS.maxSearchLength}
          onChange={handleQueryChange}
          placeholder="Buscar por nombre, inicio del ID o teléfono"
          aria-label="Buscar pedidos"
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition"
        />
      </div>

      <Tabs
        items={TAB_STATUSES.map((tab) => ({ value: tab, label: STATUS_LABELS[tab] }))}
        value={status}
        onChange={(value) => setStatus(value as OrderStatus)}
      />

      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <Spinner size={28} />
          </div>
        ) : error && orders.length === 0 ? (
          <div role="alert" className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 py-10 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
            >
              Reintentar
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center">
            <Inbox size={32} className="text-gray-300" aria-hidden />
            <p className="text-sm text-gray-500">
              {query ? `Sin resultados para "${query}"` : 'No hay pedidos en esta categoría'}
            </p>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2" role="list" aria-live="polite" aria-label="Lista de pedidos">
              {orders.map((order) => (
                <OrderRow key={order.orderId} order={order} activeStatus={status} />
              ))}
            </ul>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium rounded-lg transition"
                >
                  {loadingMore ? 'Cargando…' : 'Cargar más'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
