import { z } from 'zod'

/**
 * Primitivas de contrato compartidas por PWA, admin y backend.
 * Sin dependencias de runtime (Node/DOM): se compila en los tres entornos.
 */

/** Tope técnico de cualquier importe COP (precio, envío, total). Los límites de negocio llegan con T-07/T-08. */
export const MAX_COP_AMOUNT = 100_000_000

/** Importe en pesos colombianos: entero, finito y sin decimales. */
export const copAmountSchema = z.number().int().min(0).max(MAX_COP_AMOUNT)

/** ID opaco (pedido, usuario, producto, tienda). Un ID nunca otorga permisos por sí solo. */
export const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/
export const entityIdSchema = z.string().regex(ENTITY_ID_PATTERN, 'ID inválido')

/** Timestamp ISO 8601 en UTC con sufijo `Z` (p. ej. `2026-09-03T10:00:00.000Z`). */
export const isoUtcSchema = z.string().datetime()

const TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/

const normalizeOffset = (zone: string): string => {
  if (zone === 'Z') return 'Z'
  const digits = zone.slice(1).replace(':', '')
  return `${zone.slice(0, 1)}${digits.slice(0, 2)}:${digits.slice(2, 4) || '00'}`
}

/**
 * Normaliza un timestamp (ISO o formato texto de Postgres, p. ej.
 * `2026-09-03 10:00:00.123456+00`) a ISO UTC con milisegundos.
 */
export const normalizeIsoUtc = (value: string): string => {
  const match = TIMESTAMP_PATTERN.exec(value.trim())
  const [, date, time, fraction, zone] = match ?? []
  if (!date || !time || !zone) throw new RangeError(`Timestamp inválido: ${value}`)
  const millis = fraction ? `.${fraction.slice(1, 4).padEnd(3, '0')}` : ''
  const parsed = new Date(`${date}T${time}${millis}${normalizeOffset(zone)}`)
  if (Number.isNaN(parsed.getTime())) throw new RangeError(`Timestamp inválido: ${value}`)
  return parsed.toISOString()
}

/** Celular colombiano canónico: `57` + móvil de 10 dígitos que inicia en 3. Sin `+`, espacios ni guiones. */
export const CANONICAL_MOBILE_PATTERN = /^573\d{9}$/
export const MOBILE_ERROR_MESSAGE = 'El celular debe tener 10 dígitos colombianos'

/** Devuelve el celular canónico o `null` si el texto no es un móvil colombiano válido. */
export const normalizeColombianMobile = (raw: string): string | null => {
  if (!/^\+?[\d\s()-]+$/.test(raw.trim())) return null
  const digits = raw.replace(/\D/g, '')
  const local = digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits
  return /^3\d{9}$/.test(local) ? `57${local}` : null
}

/** Salida (DTO): ya debe venir canónico. */
export const canonicalMobileSchema = z
  .string()
  .regex(CANONICAL_MOBILE_PATTERN, MOBILE_ERROR_MESSAGE)

/** Entrada (request): acepta `+57 300 123 4567`, `300-123-4567`, etc. y entrega el valor canónico. */
export const mobileInputSchema = z.string().transform((raw, ctx) => {
  const normalized = normalizeColombianMobile(raw)
  if (normalized === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: MOBILE_ERROR_MESSAGE })
    return z.NEVER
  }
  return normalized
})
