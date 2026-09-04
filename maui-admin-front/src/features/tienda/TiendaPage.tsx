/**
 * @spec §11, CU-12, US-12, TASK-023
 * Control del estado de la tienda: override (auto/open/closed) + horario semanal.
 */
import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import type { DayHours, StoreOverride, StoreStatus, WeeklySchedule } from '@/types/storeStatus'
import { storeStatusRepo } from '@/services'
import { useSession } from '@/auth/useSession'
import { useToast } from '@/ui/Toast'
import { Spinner } from '@/ui/Spinner'

const DAY_KEYS: (keyof WeeklySchedule)[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const DAY_LABELS: Record<keyof WeeklySchedule, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
}

const OVERRIDE_OPTIONS: { value: StoreOverride; label: string; hint: string }[] = [
  { value: 'auto',   label: 'Automático',      hint: 'Sigue el horario semanal' },
  { value: 'open',   label: 'Forzar abierto',  hint: 'Ignora el horario, siempre abierta' },
  { value: 'closed', label: 'Forzar cerrado',  hint: 'Ignora el horario, siempre cerrada' },
]

export function TiendaPage() {
  const { session } = useSession()
  const toast = useToast()
  const by = session?.user.email ?? 'demo'

  const [status, setStatus] = useState<StoreStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingOverride, setSavingOverride] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleDraft, setScheduleDraft] = useState<WeeklySchedule | null>(null)

  useEffect(() => {
    let cancelled = false
    storeStatusRepo
      .get()
      .then((s) => {
        if (cancelled) return
        setStatus(s)
        setScheduleDraft(s.schedule)
      })
      .catch(() => { if (!cancelled) toast.error('No se pudo cargar el estado') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [toast])

  async function handleOverride(next: StoreOverride) {
    if (!status || next === status.override) return
    setSavingOverride(true)
    try {
      const updated = await storeStatusRepo.setOverride(next, by)
      setStatus(updated)
      toast.success(`Override: ${OVERRIDE_OPTIONS.find((o) => o.value === next)?.label}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar override')
    } finally {
      setSavingOverride(false)
    }
  }

  function updateDay(day: keyof WeeklySchedule, patch: Partial<DayHours>) {
    if (!scheduleDraft) return
    setScheduleDraft({ ...scheduleDraft, [day]: { ...scheduleDraft[day], ...patch } })
  }

  async function handleSaveSchedule() {
    if (!scheduleDraft) return
    setSavingSchedule(true)
    try {
      const updated = await storeStatusRepo.setSchedule(scheduleDraft, by)
      setStatus(updated)
      toast.success('Horario guardado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar horario')
    } finally {
      setSavingSchedule(false)
    }
  }

  if (loading || !status || !scheduleDraft) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900">Estado de la tienda</h1>

      {/* Override */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Override manual</h2>
        <p className="text-sm text-gray-500 mb-4">
          Controla el estado sin tocar el horario. En modo automático la tienda respeta el horario semanal.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {OVERRIDE_OPTIONS.map((opt) => {
            const active = status.override === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleOverride(opt.value)}
                disabled={savingOverride}
                className={`text-left p-3 rounded-xl border transition ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-semibold ${active ? 'text-indigo-700' : 'text-gray-800'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.hint}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Horario */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Horario semanal</h2>
        <div className="divide-y divide-gray-100">
          {DAY_KEYS.map((day) => {
            const d = scheduleDraft[day]
            return (
              <div key={day} className="py-3 flex items-center gap-3">
                <span className="w-24 text-sm font-medium text-gray-700">
                  {DAY_LABELS[day]}
                </span>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={d.closed}
                    onChange={(e) => updateDay(day, { closed: e.target.checked })}
                  />
                  Cerrado
                </label>
                <input
                  type="time"
                  value={d.open}
                  onChange={(e) => updateDay(day, { open: e.target.value })}
                  disabled={d.closed}
                  aria-label={`Hora de apertura ${DAY_LABELS[day]}`}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="text-sm text-gray-400">a</span>
                <input
                  type="time"
                  value={d.close}
                  onChange={(e) => updateDay(day, { close: e.target.value })}
                  disabled={d.closed}
                  aria-label={`Hora de cierre ${DAY_LABELS[day]}`}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
            )
          })}
        </div>
        <div className="pt-4">
          <button
            type="button"
            onClick={handleSaveSchedule}
            disabled={savingSchedule}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
          >
            <Save className="w-4 h-4" aria-hidden />
            {savingSchedule ? 'Guardando…' : 'Guardar horario'}
          </button>
        </div>
      </section>
    </div>
  )
}
