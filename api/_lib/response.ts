import type { VercelResponse } from '@vercel/node'
import { DomainError, NotFoundError, ValidationError } from '../../maui-back/src/shared/errors.js'
import { ConfigurationError } from '../../maui-back/src/shared/config.js'
import { buildApiError, apiErrorSchema } from '../../shared/contracts/errors.js'

export const jsonResponse = <T>(res: VercelResponse, body: T, status: number, head = false): void => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (head) {
    res.status(status).end()
    return
  }
  res.status(status).json(body)
}

export const methodNotAllowed = (res: VercelResponse, allowed: readonly string[]): void => {
  res.setHeader('Allow', allowed.join(', '))
  jsonResponse(res, buildApiError('METHOD_NOT_ALLOWED', 'Método no permitido'), 405)
}

export const ok = <T>(res: VercelResponse, body: T, status = 200): void => {
  jsonResponse(res, body, status)
}

export const fail = (res: VercelResponse, err: unknown): void => {
  if (err instanceof ConfigurationError) {
    jsonResponse(res, buildApiError('SERVICE_UNAVAILABLE', 'Servicio no disponible'), 503)
    return
  }
  if (err instanceof ValidationError) {
    const envelope = apiErrorSchema.safeParse({ error: err.code, message: err.message, issues: err.issues })
    jsonResponse(res, envelope.success ? envelope.data : buildApiError(err.code, err.message), 400)
    return
  }
  if (err instanceof NotFoundError) {
    jsonResponse(res, buildApiError(err.code, err.message), 404)
    return
  }
  if (err instanceof DomainError) {
    jsonResponse(res, buildApiError(err.code, err.message), 409)
    return
  }
  // No registrar objetos de error: drivers pueden incluir URLs, SQL o datos personales.
  console.error('Unhandled API error')
  jsonResponse(res, buildApiError('INTERNAL_ERROR', 'Internal server error'), 500)
}
