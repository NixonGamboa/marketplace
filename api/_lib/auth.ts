import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildApiError, type AuthSessionResponse } from '../../shared/contracts/index.js'
import { toAuthSessionResponse } from '../../maui-back/src/domain/auth/accountMappers.js'
import {
  AccountConflictError,
  AuthenticationError,
  AuthorizationError,
  AuthPersistenceError,
  RateLimitedError,
} from '../../maui-back/src/domain/auth/errors.js'
import { SESSION_TTL_SECONDS } from '../../maui-back/src/domain/auth/policy.js'
import { AuthConfigurationError, type AuthConfig } from '../../maui-back/src/infra/auth/config.js'
import type { AuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import {
  isTrustedOrigin,
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../../maui-back/src/infra/auth/sessionCookie.js'
import { authenticateSession, type AuthContext } from '../../maui-back/src/usecases/auth/authenticateSession.js'
import type { IssuedSession } from '../../maui-back/src/usecases/auth/deps.js'
import { fail, jsonResponse, methodNotAllowed, ok } from './response.js'

/** Tope del cuerpo JSON de auth. Los payloads reales (nombre, teléfono, clave) pesan < 1 KB. */
export const MAX_AUTH_BODY_BYTES = 4096

const NO_STORE = 'no-store, no-cache, max-age=0, must-revalidate'

/** Error de petición HTTP (origen, tipo de contenido, tamaño, JSON). No porta datos del cliente. */
export class AuthRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthRequestError'
  }
}

/** Debe llamarse antes que cualquier otra escritura: aplica a éxitos, errores y 405 por igual. */
export const prepareAuthResponse = (res: VercelResponse): void => {
  res.setHeader('Cache-Control', NO_STORE)
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Vary', 'Cookie, Origin')
}

/** Sin CORS: no se emiten cabeceras `Access-Control-*` ni se atiende OPTIONS. */
export const allowMethods = (req: VercelRequest, res: VercelResponse, methods: readonly string[]): boolean => {
  if (req.method !== undefined && methods.includes(req.method)) return true
  methodNotAllowed(res, methods)
  return false
}

/**
 * El origen de confianza es SOLO el configurado (`AUTH_ORIGIN`); nunca se deriva de
 * Host/X-Forwarded-* ni de otra cabecera enviada por el cliente.
 */
export const requireTrustedOrigin = (req: VercelRequest, config: AuthConfig): void => {
  if (!isTrustedOrigin(req.headers.origin, config.origin)) {
    throw new AuthRequestError(403, 'FORBIDDEN_ORIGIN', 'Origen no permitido')
  }
}

const isJsonContentType = (header: string | undefined): boolean => {
  if (!header) return false
  const [type, ...parameters] = header.split(';').map(part => part.trim().toLowerCase())
  return (
    type === 'application/json' &&
    parameters.every(parameter => parameter === 'charset=utf-8' || parameter === 'charset="utf-8"')
  )
}

const declaredLength = (req: VercelRequest): number => {
  const header = req.headers['content-length']
  if (header === undefined) return 0
  const length = Number(header)
  return Number.isInteger(length) && length >= 0 ? length : Number.POSITIVE_INFINITY
}

/**
 * Parsing seguro: exige `application/json`, acota el tamaño declarado y el parseado, y solo
 * acepta un objeto JSON. La validación estructural (schemas strict) ocurre en los casos de uso.
 * El body ya llega parseado por el runtime de Vercel; Content-Length acota lo declarado y el
 * tamaño re-serializado cubre bodies sin Content-Length (chunked).
 */
export const readJsonBody = (req: VercelRequest, maxBytes = MAX_AUTH_BODY_BYTES): Record<string, unknown> => {
  if (!isJsonContentType(req.headers['content-type'])) {
    throw new AuthRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Se requiere Content-Type application/json')
  }
  if (declaredLength(req) > maxBytes) {
    throw new AuthRequestError(413, 'PAYLOAD_TOO_LARGE', 'Cuerpo demasiado grande')
  }

  let body: unknown
  try {
    body = req.body
  } catch {
    throw new AuthRequestError(400, 'INVALID_JSON', 'JSON inválido')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AuthRequestError(400, 'INVALID_JSON', 'Se esperaba un objeto JSON')
  }
  if (Buffer.byteLength(JSON.stringify(body)) > maxBytes) {
    throw new AuthRequestError(413, 'PAYLOAD_TOO_LARGE', 'Cuerpo demasiado grande')
  }
  return body as Record<string, unknown>
}

/** Logout acepta petición sin cuerpo; si trae cuerpo debe ser JSON `{}`. */
export const requireEmptyBody = (req: VercelRequest): void => {
  const hasBody = declaredLength(req) > 0 || req.headers['transfer-encoding'] !== undefined
  if (!hasBody) return
  if (Object.keys(readJsonBody(req)).length > 0) {
    throw new AuthRequestError(400, 'INVALID_JSON', 'Este endpoint no acepta cuerpo')
  }
}

export const sessionTokenFrom = (req: VercelRequest, config: AuthConfig): string | null =>
  readSessionToken(req.headers.cookie, config.cookie.name)

/** La cookie lleva el token; el JSON solo lleva la proyección pública (nunca token ni hash). */
export const sendSession = (
  res: VercelResponse,
  config: AuthConfig,
  issued: IssuedSession,
  status: number,
): void => {
  res.setHeader('Set-Cookie', serializeSessionCookie(config.cookie, issued.token, SESSION_TTL_SECONDS))
  const body: AuthSessionResponse = toAuthSessionResponse(issued.account, issued.expiresAt)
  ok(res, body, status)
}

export const sendSessionStatus = (res: VercelResponse, context: AuthContext): void => {
  ok(res, toAuthSessionResponse(context.account, context.expiresAt))
}

export const sendLoggedOut = (res: VercelResponse, config: AuthConfig): void => {
  res.setHeader('Set-Cookie', serializeClearedSessionCookie(config.cookie))
  jsonResponse(res, null, 204, true)
}

/**
 * Traduce errores de auth a respuestas genéricas. 401 para credenciales/sesión (con cookie
 * borrada si se conoce su configuración), 400 validación, 409 conflicto sin datos, 429 límite,
 * 503 configuración/persistencia. El resto lo resuelve el manejador común.
 */
export const failAuth = (res: VercelResponse, err: unknown, config?: AuthConfig): void => {
  if (err instanceof AuthRequestError) {
    jsonResponse(res, buildApiError(err.code, err.message), err.status)
  } else if (err instanceof AuthenticationError) {
    if (config) res.setHeader('Set-Cookie', serializeClearedSessionCookie(config.cookie))
    jsonResponse(res, buildApiError(err.code, err.message), 401)
  } else if (err instanceof AuthorizationError) {
    jsonResponse(res, buildApiError(err.code, err.message), 403)
  } else if (err instanceof RateLimitedError) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds))
    jsonResponse(res, buildApiError(err.code, err.message), 429)
  } else if (err instanceof AccountConflictError) {
    jsonResponse(res, buildApiError(err.code, err.message), 409)
  } else if (err instanceof AuthConfigurationError || err instanceof AuthPersistenceError) {
    jsonResponse(res, buildApiError('SERVICE_UNAVAILABLE', 'Servicio no disponible'), 503)
  } else {
    fail(res, err)
  }
}

/** Autenticación de una request protegida con el runtime ya compuesto por el handler. */
export const authenticateRequest = (req: VercelRequest, runtime: AuthRuntime): Promise<AuthContext> =>
  authenticateSession(runtime.deps, sessionTokenFrom(req, runtime.config))
