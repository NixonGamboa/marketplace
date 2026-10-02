export interface CookieSettings {
  name: string
  secure: boolean
}

const MAX_TOKEN_LENGTH = 2048
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

/**
 * Atributos idénticos al crear y al borrar (requisito del navegador para reemplazar la
 * cookie): HttpOnly, SameSite=Strict, Path=/ y host-only (sin Domain). `Secure` fuera de local.
 */
const baseAttributes = (cookie: CookieSettings): string[] => [
  'Path=/',
  'HttpOnly',
  'SameSite=Strict',
  ...(cookie.secure ? ['Secure'] : []),
]

export const serializeSessionCookie = (cookie: CookieSettings, token: string, maxAgeSeconds: number): string =>
  [`${cookie.name}=${token}`, ...baseAttributes(cookie), `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`].join('; ')

export const serializeClearedSessionCookie = (cookie: CookieSettings): string =>
  [`${cookie.name}=`, ...baseAttributes(cookie), 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'].join('; ')

/**
 * Extrae el token de la cabecera Cookie. Devuelve `null` si falta, está duplicado
 * (ambiguo) o no tiene forma de JWT: no se decodifica ni se confía en su contenido.
 */
export const readSessionToken = (header: string | undefined, name: string): string | null => {
  if (!header) return null
  const values: string[] = []
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue
    if (pair.slice(0, separator).trim() === name) values.push(pair.slice(separator + 1).trim())
  }
  const [value] = values
  if (values.length !== 1 || !value) return null
  return value.length <= MAX_TOKEN_LENGTH && JWT_SHAPE.test(value) ? value : null
}

/** Comparación exacta con el origen configurado; ausente, duplicado o distinto → no confiable. */
export const isTrustedOrigin = (header: string | string[] | undefined, expectedOrigin: string): boolean =>
  typeof header === 'string' && header === expectedOrigin
