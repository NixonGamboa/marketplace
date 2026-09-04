/**
 * @spec CU-14, US-14, TASK-025
 * Últimos 200 eventos del audit log con filtro por action.
 */
import { useEffect, useMemo, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import type { AuditAction, AuditEvent } from '@/types/audit'
import { auditRepo } from '@/services'
import { useToast } from '@/ui/Toast'
import { Spinner } from '@/ui/Spinner'
import { EmptyState } from '@/ui/EmptyState'

const ACTION_LABELS: Record<AuditAction, string> = {
  'order.status_changed': 'Pedido — cambio de estado',
  'order.cancelled':      'Pedido — cancelado',
  'order.weights_set':    'Pedido — pesos capturados',
  'catalog.product_upsert':'Catálogo — producto guardado',
  'catalog.product_delete':'Catálogo — producto eliminado',
  'catalog.stock_toggled': 'Catálogo — stock alternado',
  'store.override_changed':'Tienda — override cambiado',
  'store.schedule_changed':'Tienda — horario cambiado',
  'merchant.config_changed':'Aliado — configuración guardada',
  'auth.login':            'Sesión — login',
  'auth.logout':           'Sesión — logout',
}

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'medium' })

const ALL = '__all__' as const

export function AuditPage() {
  const toast = useToast()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AuditAction | typeof ALL>(ALL)

  useEffect(() => {
    let cancelled = false
    auditRepo
      .list(200)
      .then((list) => { if (!cancelled) setEvents(list) })
      .catch(() => { if (!cancelled) toast.error('No se pudo cargar el audit log') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [toast])

  const filtered = useMemo(
    () => (filter === ALL ? events : events.filter((e) => e.action === filter)),
    [events, filter],
  )

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Auditoría</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <label htmlFor="audit-filter" className="text-sm font-medium text-gray-700">
          Filtrar por acción
        </label>
        <select
          id="audit-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as AuditAction | typeof ALL)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        >
          <option value={ALL}>Todas ({events.length})</option>
          {(Object.keys(ACTION_LABELS) as AuditAction[]).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Spinner size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={40} />}
          title="Sin eventos"
          description="Aún no hay actividad registrada para el filtro seleccionado."
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Cuándo</th>
                <th className="text-left px-4 py-2 font-medium">Usuario</th>
                <th className="text-left px-4 py-2 font-medium">Acción</th>
                <th className="text-left px-4 py-2 font-medium">Recurso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                    {dateFormatter.format(new Date(e.at))}
                  </td>
                  <td className="px-4 py-2 text-gray-700">{e.user}</td>
                  <td className="px-4 py-2 text-gray-800">{ACTION_LABELS[e.action] ?? e.action}</td>
                  <td className="px-4 py-2 text-gray-500 font-mono text-xs">{e.targetId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
