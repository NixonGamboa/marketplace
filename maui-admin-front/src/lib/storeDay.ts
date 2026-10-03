/** Zona horaria de la tienda (Colombia, sin horario de verano): define qué es «hoy» para el panel. */
const STORE_TIME_ZONE = 'America/Bogota'

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Día de la tienda como `YYYY-MM-DD`, independiente de la zona del navegador. */
export function storeDayOf(date: Date = new Date()): string {
  return dayFormatter.format(date)
}
