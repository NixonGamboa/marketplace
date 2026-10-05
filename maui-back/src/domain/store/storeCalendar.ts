import { WEEKDAY_KEYS, type WeekdayKey } from '../../../../shared/contracts/index.js'

/** Instante expresado en la hora civil de una zona IANA. */
export interface LocalMoment {
  /** `YYYY-MM-DD` local. */
  date: string
  /** `HH:MM` local, 24 h. */
  time: string
  /** Minutos desde la medianoche local (0–1439). */
  minutes: number
  weekday: WeekdayKey
}

const formatters = new Map<string, Intl.DateTimeFormat>()

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

const isWeekdayKey = (value: string): value is WeekdayKey => (WEEKDAY_KEYS as readonly string[]).includes(value)

/**
 * Convierte un instante a la hora local de `timeZone` con la base IANA del runtime, sin
 * depender de la zona del servidor (UTC en Vercel). El día de la semana es el local: las
 * 19:30 de un lunes en Bogotá son martes en UTC y siguen usando el horario del lunes.
 */
export const localMomentIn = (instant: Date, timeZone: string): LocalMoment => {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  )
  const weekday = String(parts.weekday).toLowerCase()
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  if (!isWeekdayKey(weekday) || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new RangeError('No se pudo calcular la hora local de la tienda')
  }
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time, minutes: hour * 60 + minute, weekday }
}

const parseDate = (date: string): [number, number, number] => {
  const [year, month, day] = date.split('-').map(Number)
  return [year ?? 0, month ?? 1, day ?? 1]
}

/** `YYYY-MM-DD` desplazada `days` días civiles (sin depender de la zona del runtime). */
export const addCalendarDays = (date: string, days: number): string => {
  const [year, month, day] = parseDate(date)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * Instante UTC que corresponde a la fecha `YYYY-MM-DD` y hora `HH:MM` locales de `timeZone`.
 * Se corrige la diferencia entre la hora pedida y la que `timeZone` marca para el instante
 * candidato; dos pasadas bastan para el desfase de una zona (la tienda no usa horario de verano).
 */
export const instantFromLocal = (date: string, time: string, timeZone: string): Date => {
  const [year, month, day] = parseDate(date)
  const [hours, minutes] = time.split(':').map(Number)
  const wanted = Date.UTC(year, month - 1, day, hours ?? 0, minutes ?? 0)
  let candidate = wanted
  for (let pass = 0; pass < 2; pass += 1) {
    const local = localMomentIn(new Date(candidate), timeZone)
    const [localYear, localMonth, localDay] = parseDate(local.date)
    candidate += wanted - Date.UTC(localYear, localMonth - 1, localDay, 0, local.minutes)
  }
  return new Date(candidate)
}
