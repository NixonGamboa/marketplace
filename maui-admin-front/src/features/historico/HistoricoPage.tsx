/**
 * @spec CU-9, US-9, TASK-020
 * Histórico de pedidos con filtro por rango de fechas. Default: últimos 30 días.
 */
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Inbox } from 'lucide-react'
import type { AdminOrder } from '@/types/adminOrder'
import { orderRepo } from '@/services'
import { useToast } from '@/ui/Toast'
import { Spinner } from '@/ui/Spinner'
import { EmptyState } from '@/ui/EmptyState'
import { StatusBadge } from '@/features/orders/StatusBadge'

const DAY_MS = 24 * 60 * 60 * 1000

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

export function HistoricoPage() {
  const toast = useToast()
  const initial = defaultRange()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (rangeFrom: string, rangeTo: string) => {
      setLoading(true)
      try {
        const list = await orderRepo.list({ from: rangeFrom, to: rangeTo })
        setOrders(list as AdminOrder[])
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo cargar el histórico')
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load(initial.from, initial.to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleApply(e: React.FormEvent) {
    e.preventDefault()
    if (from > to) {
      toast.error('El "desde" no puede ser mayor que el "hasta"')
      return
    }
    load(from, to)
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
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
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
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
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
                    {currencyFormatter.format(o.estimatedTotal)}
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
    </div>
  )
}
