import { ApiError } from '@/services/http/apiError'

/**
 * Texto para el usuario de un fallo: los `ApiError` ya traen un mensaje seguro y en español
 * (envelope del servidor o texto por tipo); cualquier otro error usa el texto de respaldo.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error && error.message ? error.message : fallback
}

/** Cancelaciones propias (cambio de filtro, desmontaje): no son un fallo que mostrar. */
export function isAbort(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'aborted'
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'conflict'
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'not_found'
}
