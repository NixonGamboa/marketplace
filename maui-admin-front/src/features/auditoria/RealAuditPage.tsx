/**
 * T-17 (modo real) — Auditoría persistente del servidor (T-13), solo owner.
 * Filtros por entidad, acción, ID y fechas se aplican en el servidor antes de paginar con cursor.
 * El actor se identifica por su ID de cuenta (el contrato no incluye nombres ni datos personales)
 * y el detalle muestra solo los campos permitidos por el contrato, nunca valores libres.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { AUDIT_ACTION_VALUES, AUDIT_ENTITY_VALUES, type AuditEvent } from '@shared/contracts'
import { serverAuditRepo } from '@/services'
import type { AuditFilterInput } from '@/services/realAuditRepository'
import { errorMessage, isAbort } from '@/lib/errorMessage'
import { storeDayOf } from '@/lib/storeDay'
import { Spinner } from '@/ui/Spinner'
import { EmptyState } from '@/ui/EmptyState'

const ENTITY_LABELS: Record<AuditEvent['entity'], string> = {
  order: 'Pedido',
  product: 'Producto',
  category: 'Categoría',
  store: 'Tienda',
}

const ACTION_LABELS: Record<AuditEvent['action'], string> = {
  created: 'Creado',
  updated: 'Actualizado',
  deleted: 'Eliminado',
  status_changed: 'Cambio de estado',
  items_changed: 'Cambio de ítems',
}

const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'medium' })

const DAY_MS = 24 * 60 * 60 * 1000
const STORE_UTC_OFFSET = '-05:00'

/** Día de la tienda `YYYY-MM-DD` → instante ISO UTC de su medianoche (Colombia no usa horario de verano). */
const startOfStoreDay = (day: string): string => new Date(`${day}T00:00:00.000${STORE_UTC_OFFSET}`).toISOString()
const startOfNextStoreDay = (day: string): string => new Date(Date.parse(startOfStoreDay(day)) + DAY_MS).toISOString()

/** Resumen legible del metadato permitido por el contrato. */
function describe(event: AuditEvent): string {
  const { metadata } = event
  const parts: string[] = []
  if (metadata.previousStatus || metadata.status) parts.push(`${metadata.previousStatus ?? '—'} → ${metadata.status ?? '—'}`)
  if (metadata.fields?.length) parts.push(`campos: ${metadata.fields.join(', ')}`)
  if (metadata.changes?.length) parts.push(`${metadata.changes.length} cambio(s) de ítems`)
  if (metadata.finalTotal !== undefined) parts.push(`total final ${metadata.finalTotal}`)
  if (metadata.version !== undefined) parts.push(`v${metadata.version}`)
  return parts.join(' · ') || '—'
}

const actorOf = (event: AuditEvent): string => (event.actorKind === 'system' ? 'Sistema' : event.actorId ?? '—')

export function RealAuditPage() {
  const [entity, setEntity] = useState<AuditEvent['entity'] | ''>('')
  const [action, setAction] = useState<AuditEvent['action'] | ''>('')
  const [entityId, setEntityId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [applied, setApplied] = useState<AuditFilterInput>({})
  const [formError, setFormError] = useState<string | null>(null)

  const [events, setEvents] = useState<AuditEvent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    setLoading(true)
    setError(null)
    serverAuditRepo.listPage(applied, { limit: 50 }, { signal: controller.signal }).then(
      (page) => {
        if (controller.signal.aborted) return
        setEvents(page.items)
        setNextCursor(page.nextCursor)
      },
      (failure: unknown) => {
        if (controller.signal.aborted || isAbort(failure)) return
        setEvents([])
        setNextCursor(null)
        setError(errorMessage(failure, 'No se pudo cargar la auditoría.'))
      },
    ).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [applied, reloadToken])

  const loadMore = useCallback(() => {
    if (nextCursor === null || loadingMore) return
    const controller = new AbortController()
    controllerRef.current = controller
    setLoadingMore(true)
    setError(null)
    serverAuditRepo.listPage(applied, { limit: 50, cursor: nextCursor }, { signal: controller.signal }).then(
      (page) => {
        if (controller.signal.aborted) return
        setEvents((current) => [...current, ...page.items])
        setNextCursor(page.nextCursor)
      },
      (failure: unknown) => {
        if (controller.signal.aborted || isAbort(failure)) return
        setError(errorMessage(failure, 'No se pudieron cargar más eventos.'))
      },
    ).finally(() => {
      if (!controller.signal.aborted) setLoadingMore(false)
    })
  }, [applied, nextCursor, loadingMore])

  function handleApply(event: React.FormEvent) {
    event.preventDefault()
    if (from && to && from > to) {
      setFormError('El "desde" no puede ser mayor que el "hasta"')
      return
    }
    setFormError(null)
    setApplied({
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
      ...(entityId.trim() ? { entityId: entityId.trim() } : {}),
      ...(from ? { from: startOfStoreDay(from) } : {}),
      ...(to ? { to: startOfNextStoreDay(to) } : {}),
    })
  }

  const today = storeDayOf()

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Auditoría</h1>

      <form onSubmit={handleApply} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="audit-entity" className="block text-xs font-medium text-gray-600 mb-1">Entidad</label>
          <select
            id="audit-entity"
            value={entity}
            onChange={(e) => setEntity(e.target.value as AuditEvent['entity'] | '')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
          >
            <option value="">Todas</option>
            {AUDIT_ENTITY_VALUES.map((value) => <option key={value} value={value}>{ENTITY_LABELS[value]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="audit-action" className="block text-xs font-medium text-gray-600 mb-1">Acción</label>
          <select
            id="audit-action"
            value={action}
            onChange={(e) => setAction(e.target.value as AuditEvent['action'] | '')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
          >
            <option value="">Todas</option>
            {AUDIT_ACTION_VALUES.map((value) => <option key={value} value={value}>{ACTION_LABELS[value]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="audit-entity-id" className="block text-xs font-medium text-gray-600 mb-1">ID del recurso</label>
          <input
            id="audit-entity-id"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            maxLength={64}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 font-mono"
          />
        </div>
        <div>
          <label htmlFor="audit-from" className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
          <input id="audit-from" type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5" />
        </div>
        <div>
          <label htmlFor="audit-to" className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input id="audit-to" type="date" max={today} value={to} onChange={(e) => setTo(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5" />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
        >
          Aplicar
        </button>
      </form>
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Spinner size={28} />
        </div>
      ) : error && events.length === 0 ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 py-10 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
          >
            Reintentar
          </button>
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={40} />}
          title="Sin eventos"
          description="Aún no hay actividad registrada para los filtros seleccionados."
        />
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Cuándo</th>
                  <th className="text-left px-4 py-2 font-medium">Actor</th>
                  <th className="text-left px-4 py-2 font-medium">Entidad</th>
                  <th className="text-left px-4 py-2 font-medium">Acción</th>
                  <th className="text-left px-4 py-2 font-medium">Recurso</th>
                  <th className="text-left px-4 py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{dateFormatter.format(new Date(event.createdAt))}</td>
                    <td className="px-4 py-2 text-gray-700 font-mono text-xs">{actorOf(event)}</td>
                    <td className="px-4 py-2 text-gray-800">{ENTITY_LABELS[event.entity]}</td>
                    <td className="px-4 py-2 text-gray-800">{ACTION_LABELS[event.action]}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{event.entityId}</td>
                    <td className="px-4 py-2 text-gray-600 text-xs">{describe(event)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {nextCursor !== null && (
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
        </>
      )}
    </div>
  )
}
