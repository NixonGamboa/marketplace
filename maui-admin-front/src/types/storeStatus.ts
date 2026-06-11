// Estado de apertura de la tienda + horario semanal del aliado.
// Source of truth: tech/wip/20260611-evolucion-admin-panel-demo/2-technical/spec.md §5.3

export type StoreOverride = 'auto' | 'open' | 'closed'

export interface DayHours {
  /** Hora de apertura en formato 24h "HH:MM". Ignorada si `closed = true`. */
  open: string
  /** Hora de cierre en formato 24h "HH:MM". Ignorada si `closed = true`. */
  close: string
  /** Marca el día como cerrado independientemente de los horarios. */
  closed: boolean
}

export interface WeeklySchedule {
  mon: DayHours
  tue: DayHours
  wed: DayHours
  thu: DayHours
  fri: DayHours
  sat: DayHours
  sun: DayHours
}

export interface StoreStatus {
  /**
   * `auto`: deriva de `schedule`. `open` / `closed`: override manual del aliado
   * que ignora el horario hasta que se vuelve a `auto`.
   */
  override: StoreOverride
  schedule: WeeklySchedule
  updatedAt: string
}
