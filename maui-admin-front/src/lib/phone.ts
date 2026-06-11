// Utilidades de teléfono para el panel admin (ADR-008).
//
// El formato canónico es **sólo dígitos**, incluyendo el prefijo de país sin
// `+`, sin espacios ni guiones (ej. "573015550101" para +57 301 555 0101).
// Ese formato se almacena en `Order.customerPhone` y `MerchantConfig.whatsapp`
// y es el que `wa.me/{phone}` espera directamente.

/**
 * Normaliza un teléfono ingresado libremente a sólo dígitos.
 * No valida longitud — eso es responsabilidad del caller.
 *
 * @example normalizePhone('+57 301 555-0101') // '573015550101'
 * @example normalizePhone('301 5550101')      // '3015550101'
 */
export function normalizePhone(raw: string): string {
  return (raw ?? '').replace(/\D+/g, '')
}

/**
 * Devuelve un formato legible para mostrar en la UI.
 * Heurística para números colombianos (12 dígitos con prefijo 57):
 * "+57 301 555 0101". Para otros largos devuelve agrupado en bloques de 3.
 */
export function formatPhonePretty(phone: string): string {
  const digits = normalizePhone(phone)
  if (digits.length === 12 && digits.startsWith('57')) {
    return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }
  return digits.replace(/(.{3})(?=.)/g, '$1 ').trim()
}

/** Últimos 4 dígitos del teléfono (para mostrar "…0101" en listas). */
export function phoneLast4(phone: string): string {
  return normalizePhone(phone).slice(-4)
}

/**
 * Matcher de búsqueda según ADR-008:
 *  - Si la query (normalizada) tiene exactamente 4 dígitos → `endsWith` (últimos 4).
 *  - Si tiene más de 4 dígitos → `includes` (sub-cadena).
 *  - Si tiene menos de 1 dígito o no es numérica → `false`.
 */
export function phoneMatchesQuery(phone: string, query: string): boolean {
  const phoneDigits = normalizePhone(phone)
  const queryDigits = normalizePhone(query)
  if (queryDigits.length === 0) return false
  if (queryDigits.length === 4) return phoneDigits.endsWith(queryDigits)
  if (queryDigits.length > 4) return phoneDigits.includes(queryDigits)
  return false
}
