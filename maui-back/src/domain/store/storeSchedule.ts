import {
  WEEKDAY_KEYS,
  minutesOfDay,
  type DayHoursDto,
  type ScheduleOverride,
  type StoreClosedReason,
  type TimeSlot,
  type TimeSlotConfigDto,
  type WeeklyScheduleDto,
} from '../../../../shared/contracts/index.js'
import { addCalendarDays, instantFromLocal, type LocalMoment } from './storeCalendar.js'

/** Motivo por el que la tienda no atiende en `minutes` del día `day`; `undefined` si atiende. */
export const closedReasonOf = (
  override: ScheduleOverride,
  day: DayHoursDto,
  minutes: number,
): StoreClosedReason | undefined => {
  if (override === 'closed') return 'override_closed'
  if (override === 'open') return undefined
  if (day.closed) return 'day_closed'
  if (minutes < minutesOfDay(day.open)) return 'before_opening'
  if (minutes >= minutesOfDay(day.close)) return 'after_closing'
  return undefined
}

/**
 * Una franja con ventana se ofrece mientras su fin (o el cierre, si llega antes) no haya
 * pasado y empiece antes del cierre. `closesAt` es `null` con apertura manual (`open`).
 */
const isSlotAvailable = (slot: TimeSlotConfigDto, minutes: number, closesAt: number | null): boolean => {
  if (!slot.enabled) return false
  if (slot.id === 'asap') return true
  const end = closesAt === null ? minutesOfDay(slot.end) : Math.min(minutesOfDay(slot.end), closesAt)
  const startsBeforeClose = closesAt === null || minutesOfDay(slot.start) < closesAt
  return startsBeforeClose && minutes < end
}

/** Franjas habilitadas vigentes en el minuto `minutes` de un día que cierra a `closesAt`. */
export const slotsAvailableAt = (
  slots: readonly TimeSlotConfigDto[],
  minutes: number,
  closesAt: number | null,
): TimeSlot[] => slots.filter((slot) => isSlotAvailable(slot, minutes, closesAt)).map((slot) => slot.id)

/** Franjas habilitadas sin referencia a una fecha concreta (reapertura desconocida). */
export const enabledSlots = (slots: readonly TimeSlotConfigDto[]): TimeSlot[] =>
  slots.filter((slot) => slot.enabled).map((slot) => slot.id)

export interface NextOpening {
  /** Fecha local `YYYY-MM-DD` de la apertura. */
  date: string
  startsAt: Date
  /** Minutos de apertura y cierre de ese día: referencia para evaluar las franjas compatibles. */
  opensAt: number
  closesAt: number
}

/**
 * Aperturas con atención del ciclo semanal, en orden cronológico, ignorando el override (que no tiene
 * fecha de fin). Con `includeToday` cuenta la apertura de hoy si aún no ha ocurrido; después recorre los
 * siguientes siete días (un ciclo completo). Vacío si ningún día atiende.
 */
export const attendedOpenings = (
  schedule: WeeklyScheduleDto,
  from: LocalMoment,
  timeZone: string,
  includeToday: boolean,
): NextOpening[] => {
  const openings: NextOpening[] = []
  const todayIndex = WEEKDAY_KEYS.indexOf(from.weekday)
  for (let offset = includeToday ? 0 : 1; offset <= WEEKDAY_KEYS.length; offset += 1) {
    const day = schedule[WEEKDAY_KEYS[(todayIndex + offset) % WEEKDAY_KEYS.length]!]
    if (day.closed) continue
    if (offset === 0 && from.minutes >= minutesOfDay(day.open)) continue
    const date = addCalendarDays(from.date, offset)
    openings.push({
      date,
      startsAt: instantFromLocal(date, day.open, timeZone),
      opensAt: minutesOfDay(day.open),
      closesAt: minutesOfDay(day.close),
    })
  }
  return openings
}

/** Próxima apertura con atención (ver `attendedOpenings`); `null` si ningún día atiende. */
export const nextOpening = (
  schedule: WeeklyScheduleDto,
  from: LocalMoment,
  timeZone: string,
  includeToday: boolean,
): NextOpening | null => attendedOpenings(schedule, from, timeZone, includeToday)[0] ?? null
