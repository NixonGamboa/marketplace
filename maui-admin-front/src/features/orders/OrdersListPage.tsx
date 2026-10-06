/**
 * @spec CU-2, CU-7, US-2, US-7, ADR-008, TASK-016
 * Lista de pedidos con tabs por estado, búsqueda multi-campo y badge de cuenta.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Inbox } from 'lucide-react'
import { orderReferenceLabel } from '@shared/receipts'
import type { OrderStatus } from '@/types/orderService'
import type { AdminOrder } from '@/types/adminOrder'
import { isCancelled } from '@/types/adminOrder'
import { orderRepo } from '@/services'
import { Spinner } from '@/ui/Spinner'
import { Tabs } from '@/ui/Tabs'
import { OrderRow } from './OrderRow'
import { phoneMatchesQuery } from '@/lib/phone'

const DEBOUNCE_MS = 150

const CANCELLED_TAB = 'cancelled' as const
type TabValue = OrderStatus | typeof CANCELLED_TAB

const ORDERED_STATUSES: OrderStatus[] = ['received', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered']
const ORDERED_TABS: TabValue[] = [...ORDERED_STATUSES, CANCELLED_TAB]

const STATUS_LABELS: Record<TabValue, string> = {
  received: 'Recibidos',
  confirmed: 'Confirmados',
  preparing: 'Preparando',
  ready: 'Listos',
  in_delivery: 'En camino',
  delivered: 'Entregados',
  cancelled: 'Cancelados',
}

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
      orderReferenceLabel(o).toLowerCase().includes(lower),
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

