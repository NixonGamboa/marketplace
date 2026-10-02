import { z } from 'zod'

/**
 * Configuración de auth, independiente de `shared/config.ts`: se valida de forma lazy al
 * primer uso, así `/api/health` y pedidos siguen funcionando sin secreto de auth.
 */

const MIN_SECRET_BYTES = 32
const MIN_DISTINCT_SECRET_BYTES = 16
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']

const environmentSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'production']),
  AUTH_JWT_SECRET: z.string().min(1).max(1024),
  AUTH_ORIGIN: z.string().min(1).max(256),
})

export interface AuthConfig {
  appEnv: 'local' | 'test' | 'production'
  /** Único origen aceptado en mutaciones; también `iss` del JWT. */
  origin: string
  /** Secreto HMAC decodificado (≥ 32 bytes). */
  secret: Uint8Array
  issuer: string
  audience: string
  cookie: { name: string; secure: boolean }
}

/** Solo contiene códigos de diagnóstico; nunca los valores del entorno. */
export class AuthConfigurationError extends Error {
  readonly code = 'INVALID_AUTH_CONFIGURATION'

  constructor(public readonly issues: readonly string[]) {
    super('La configuración de autenticación es inválida')
    this.name = 'AuthConfigurationError'
  }
}

const reject = (issue: string): never => {
  throw new AuthConfigurationError([issue])
}

const decodeSecret = (raw: string): Uint8Array => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return reject('AUTH_JWT_SECRET_NOT_BASE64')
  const bytes = Buffer.from(raw, 'base64')
  if (bytes.toString('base64') !== raw) return reject('AUTH_JWT_SECRET_NOT_BASE64')
  if (bytes.length < MIN_SECRET_BYTES) return reject('AUTH_JWT_SECRET_TOO_SHORT')
  if (new Set(bytes).size < MIN_DISTINCT_SECRET_BYTES) return reject('AUTH_JWT_SECRET_LOW_ENTROPY')
  return new Uint8Array(bytes)
}

const validateOrigin = (raw: string, appEnv: AuthConfig['appEnv']): string => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return reject('AUTH_ORIGIN_INVALID')
  }
  // Exige la forma canónica de `Origin`: sin path, query, credenciales, barra final ni puerto por defecto.
  if (url.origin !== raw || url.username || url.password) return reject('AUTH_ORIGIN_INVALID')

  const loopback = LOOPBACK_HOSTS.includes(url.hostname)
  if (appEnv === 'local') {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return reject('AUTH_ORIGIN_LOCAL_REQUIRES_HTTP')
    if (!loopback) return reject('AUTH_ORIGIN_LOCAL_REQUIRES_LOOPBACK')
  } else {
    if (url.protocol !== 'https:') return reject('AUTH_ORIGIN_REQUIRES_HTTPS')
    if (loopback) return reject('AUTH_ORIGIN_LOOPBACK_NOT_ALLOWED')
  }
  return raw
}

export function loadAuthConfig(environment: NodeJS.ProcessEnv): AuthConfig {
  const parsed = environmentSchema.safeParse(environment)
  if (!parsed.success) {
    throw new AuthConfigurationError(parsed.error.issues.map(issue => issue.path.join('.')))
  }
  const { APP_ENV: appEnv, AUTH_JWT_SECRET, AUTH_ORIGIN } = parsed.data

  const origin = validateOrigin(AUTH_ORIGIN, appEnv)
  const secret = decodeSecret(AUTH_JWT_SECRET)
  const secure = appEnv !== 'local'

  return {
    appEnv,
    origin,
    secret,
    issuer: origin,
    audience: `maui-${appEnv}`,
    // `__Host-` exige Secure, Path=/ y host-only: solo aplica fuera de local (HTTP).
    cookie: { name: secure ? '__Host-maui_session' : 'maui_session', secure },
  }
}

let cached: AuthConfig | undefined

/** Evaluado dentro de la operación para que HTTP convierta el fallo en 503. Un fallo no se cachea. */
export function getAuthConfig(): AuthConfig {
  return (cached ??= loadAuthConfig(process.env))
}
