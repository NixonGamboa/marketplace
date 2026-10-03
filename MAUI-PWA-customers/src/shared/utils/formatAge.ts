const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Antigüedad legible en español: «hace un momento», «hace 5 min», «hace 3 h», «hace 2 días». */
export function formatAge(timestamp: number, now: number): string {
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < MINUTE_MS) return 'hace un momento'
  if (elapsed < HOUR_MS) return `hace ${Math.floor(elapsed / MINUTE_MS)} min`
  if (elapsed < DAY_MS) return `hace ${Math.floor(elapsed / HOUR_MS)} h`
  const days = Math.floor(elapsed / DAY_MS)
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`
}
