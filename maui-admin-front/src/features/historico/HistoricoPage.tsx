/**
 * @spec CU-9, US-9, TASK-020
 * Histórico de pedidos con filtro por rango de fechas. Default: últimos 30 días.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Inbox } from 'lucide-react'
import { ORDER_LIST_LIMITS } from '@shared/contracts'
import { ORDER_STATUS_VALUES } from '@shared/contracts'
import type { OrderStatus } from '@/types/orderService'
import { isDemoMode } from '@/services'
import { FieldError } from '@/ui/FieldError'
import { fieldErrorId, invalidInputClass } from '@/ui/fieldStyles'
import { Spinner } from '@/ui/Spinner'
import { EmptyState } from '@/ui/EmptyState'
import { StatusBadge } from '@/features/orders/StatusBadge'
import { useOrderPages } from '@/features/orders/useOrderPages'
import type { OrderListFilterInput } from '@/services/real/adapters'

const RANGE_ERROR = 'La fecha «Desde» no puede ser posterior a «Hasta».'
const DAY_MS =24 * 60 * 60 * 1000

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 30 * DAY_MS)
  return { from: isoDate(from), to: isoDate(to) }
}

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})
const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

const STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Recibido',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Listo',
  in_delivery: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export function HistoricoPage() {
  const [rangeAttempted, setRangeAttempted] = useState(false)
  const initial = defaultRange()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [statusDraft, setStatusDraft] = useState<OrderStatus | ''>('')
  const [queryDraft, setQueryDraft] = useState('')
  // Filtros aplicados: el listado solo se recarga al pulsar «Aplicar», nunca al teclear.
  const [applied, setApplied] = useState<OrderListFilterInput>({ from: initial.from, to: initial.to })
  const { orders, loading, loadingMore, error, hasMore, loadMore, reload } = useOrderPages(applied)

  // El error del rango aparece al aplicar y se retira solo cuando las fechas vuelven a ser coherentes.
  const rangeError = rangeAttempted && from > to ? RANGE_ERROR : null
  const rangeFieldProps = {
    'aria-invalid': rangeError !== null,
    'aria-describedby': rangeError ? fieldErrorId('hist-range') : undefined,
  }
  const dateInputClass = `border rounded-lg px-3 py-1.5 text-sm ${rangeError ? invalidInputClass : 'border-gray-300'}`

  function handleApply(e: React.FormEvent) {
    e.preventDefault()
    setRangeAttempted(true)
    if (from > to) {
      document.getElementById('hist-from')?.focus()
      return
    }
    const q = queryDraft.trim()
    setApplied({ from, to, ...(statusDraft ? { status: statusDraft } : {}), ...(q ? { q } : {}) })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Histórico</h1>

      <form
        onSubmit={handleApply}
        className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3"
      >
        <div>
          <label htmlFor="hist-from" className="block text-xs font-medium text-gray-600 mb-1">
            Desde
          </label>
          <input
            id="hist-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            {...rangeFieldProps}
            className={dateInputClass}
          />
        </div>
        <div>
          <label htmlFor="hist-to" className="block text-xs font-medium text-gray-600 mb-1">
            Hasta
          </label>
          <input
            id="hist-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            {...rangeFieldProps}
            className={dateInputClass}
          />
          <FieldError id="hist-range" message={rangeError} />
        </div>
        {!isDemoMode && (
          <>
            <div>
              <label htmlFor="hist-status" className="block text-xs font-medium text-gray-600 mb-1">
                Estado
              </label>
              <select
                id="hist-status"
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value as OrderStatus | '')}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">Todos</option>
                {ORDER_STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>{STATUS_LABELS[value]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hist-q" className="block text-xs font-medium text-gray-600 mb-1">
                Buscar
              </label>
              <input
                id="hist-q"
                type="search"
                value={queryDraft}
                maxLength={ORDER_LIST_LIMITS.maxSearchLength}
                onChange={(e) => setQueryDraft(e.target.value)}
                placeholder="Nombre, ID o teléfono"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
          </>
        )}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
        >
          <Calendar className="w-4 h-4" aria-hidden />
          Aplicar
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Spinner size={28} />
        </div>
      ) : error && orders.length === 0 ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 py-10 text-center">
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
        <EmptyState
          icon={<Inbox size={40} />}
          title="Sin pedidos en el rango"
          description="Ajusta el rango de fechas para ver resultados."
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Pedido</th>
                <th className="text-left px-4 py-2 font-medium">Cliente</th>
                <th className="text-left px-4 py-2 font-medium">Fecha</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
                <th className="text-left px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => (
                <tr key={o.orderId} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-indigo-700">
                    <Link to={`/pedidos/${o.orderId}`}>{o.orderId}</Link>
                  </td>
                  <td className="px-4 py-2 text-gray-800">{o.customerName}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {dateFormatter.format(new Date(o.createdAt))}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-gray-800">
                    {currencyFormatter.format(o.finalTotal ?? o.estimatedTotal)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && error && orders.length > 0 && (
        <p role="alert" className="text-sm text-red-700">{error}</p>
      )}
      {!loading && hasMore && (
        <div className="flex justify-center">
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
    </div>
  )
}
