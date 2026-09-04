/**
 * @spec CU-2, CU-7, US-2, US-7, ADR-008, TASK-016
 * Lista de pedidos con tabs por estado, búsqueda multi-campo y badge de cuenta.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Inbox } from 'lucide-react'
import type { OrderStatus } from '@/types/orderService'
import type { AdminOrder } from '@/types/adminOrder'
import { isCancelled } from '@/types/adminOrder'
import { orderRepo } from '@/services'
import { Spinner } from '@/ui/Spinner'
import { Tabs } from '@/ui/Tabs'
import { StatusBadge } from './StatusBadge'
import { phoneLast4, phoneMatchesQuery } from '@/lib/phone'

const DEBOUNCE_MS = 150

const CANCELLED_TAB = 'cancelled' as const
type TabValue = OrderStatus | typeof CANCELLED_TAB

const ORDERED_STATUSES: OrderStatus[] = ['received', 'confirmed', 'preparing', 'ready', 'delivered']
const ORDERED_TABS: TabValue[] = [...ORDERED_STATUSES, CANCELLED_TAB]

const STATUS_LABELS: Record<TabValue, string> = {
  received: 'Recibidos',
  confirmed: 'Confirmados',
  preparing: 'Preparando',
  ready: 'Listos',
  delivered: 'Entregados',
  cancelled: 'Cancelados',
}

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

/** Determina si una cadena es completamente numérica (después de normalizar). */
function isAllDigits(s: string): boolean {
  return /^\d+$/.test(s.trim())
}

/** Filtra la lista según la query: numérico → phone suffix; texto → name/id. */
function applySearch(orders: AdminOrder[], query: string): AdminOrder[] {
  const q = query.trim()
  if (!q) return orders
  if (isAllDigits(q)) {
    return orders.filter((o) => o.customerPhone && phoneMatchesQuery(o.customerPhone, q))
  }
  const lower = q.toLowerCase()
  return orders.filter(
    (o) =>
      o.customerName.toLowerCase().includes(lower) ||
      o.orderId.toLowerCase().includes(lower),
  )
}

function formatTime(isoString: string): string {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(isoString),
  )
}

export function OrdersListPage() {
  const [all, setAll] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStatus, setActiveStatus] = useState<TabValue>('received')
  const [rawQuery, setRawQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const orders = await orderRepo.list()
      setAll(orders as AdminOrder[])
    } catch {
      // silencioso en demo
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Debounce 150ms (AC-8)
  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setRawQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), DEBOUNCE_MS)
  }

  // Counts por tab. Los pedidos cancelados salen de sus tabs de status previo
  // y viven exclusivamente en la tab "Cancelados" (RN-6, estado terminal).
  const counts = ORDERED_TABS.reduce<Record<TabValue, number>>(
    (acc, tab) => {
      if (tab === CANCELLED_TAB) {
        acc[tab] = all.filter(isCancelled).length
      } else {
        acc[tab] = all.filter((o) => o.status === tab && !isCancelled(o)).length
      }
      return acc
    },
    {} as Record<TabValue, number>,
  )

  const tabItems = ORDERED_TABS.map((tab) => ({
    value: tab,
    label: STATUS_LABELS[tab],
    badge: counts[tab],
  }))

  // Filtrar por tab activo + búsqueda
  const byStatus = activeStatus === CANCELLED_TAB
    ? all.filter(isCancelled)
    : all.filter((o) => o.status === activeStatus && !isCancelled(o))
  const filtered = applySearch(byStatus, debouncedQuery)

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Pedidos</h1>

      {/* Búsqueda */}
      <div className="relative mb-4">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          aria-hidden
        />
        <input
          type="search"
          value={rawQuery}
          onChange={handleQueryChange}
          placeholder="Buscar por nombre, ID o últimos 4 dígitos del teléfono"
          aria-label="Buscar pedidos"
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition"
        />
      </div>

      {/* Tabs */}
      <Tabs items={tabItems} value={activeStatus} onChange={(v) => setActiveStatus(v as TabValue)} />

      {/* Lista */}
      <div className="mt-4">
        {filtered.length === 0 ? (
          <div className="mt-6">
            <EmptyOrdersList query={debouncedQuery} />
          </div>
        ) : (
          <ul className="flex flex-col gap-2" role="list" aria-live="polite" aria-label="Lista de pedidos">
            {filtered.map((order) => (
              <OrderRow key={order.orderId} order={order} activeStatus={activeStatus} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function EmptyOrdersList({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center">
      <Inbox size={32} className="text-gray-300" aria-hidden />
      <p className="text-sm text-gray-500">
        {query ? `Sin resultados para "${query}"` : 'No hay pedidos en esta categoría'}
      </p>
    </div>
  )
}

interface OrderRowProps {
  order: AdminOrder
  activeStatus: TabValue
}

function OrderRow({ order, activeStatus }: OrderRowProps) {
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
        aria-label={`Pedido ${order.orderId} de ${order.customerName}, estado ${order.status}`}
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
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{order.orderId}</p>
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
