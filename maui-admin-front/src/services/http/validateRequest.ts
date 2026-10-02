import { ApiError, defaultMessageFor } from './apiError'
import type { ResponseSchema } from './apiClient'

/**
 * Valida una petición contra el esquema compartido ANTES de enviarla y devuelve el valor
 * normalizado (teléfonos canónicos, trim). Un fallo es `invalid_request`: no consume red ni cuota.
 */
export const validateRequest = <T>(schema: ResponseSchema<T>, value: unknown): T => {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new ApiError({
    kind: 'invalid_request',
    message: parsed.error.issues[0]?.message ?? defaultMessageFor('invalid_request'),
    issues: parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  })
}
