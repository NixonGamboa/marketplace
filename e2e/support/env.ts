/**
 * Configuración del runner solo por variables de entorno. Nunca se imprime un valor: los errores
 * nombran la variable faltante, no su contenido.
 *
 * - `BASE_URL` (o `AUTH_ORIGIN`): origen del Preview de test que sirve PWA, admin (`/admin`) y API.
 * - `SMOKE_BYPASS_TOKEN`: protección de Preview de Vercel; solo se envía al hostname de `BASE_URL`.
 * - `SMOKE_CUSTOMER_*`, `SMOKE_STAFF_*` y, si el personal no es owner, `SMOKE_OWNER_*`.
 * - `E2E_READY_STAMP`: lo fija el launcher tras validar `night-cloud-ready.json`; sin él, solo se
 *   acepta un destino local en loopback.
 */

export interface Destination {
  /** Origen limpio sin barra final. */
  origin: string
  hostname: string
  loopback: boolean
  /** Origen que el servidor acepta en mutaciones; el navegador envía el del propio destino. */
  authOrigin: string
  bypassToken: string | null
  readyStamp: string | null
  previewSha: string | null
}

export interface Credentials {
  customer: { phone: string; password: string }
  staff: { email: string; password: string }
  /** Cuenta owner para abrir la tienda; por defecto la misma del personal. */
  owner: { email: string; password: string }
}

type Source = Record<string, string | undefined>

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export class ConfigurationError extends Error {}

function cleanOrigin(raw: string, label: string): URL {
  let url: URL
  try { url = new URL(raw) } catch { throw new ConfigurationError(`${label} no es una URL válida`) }
  const loopback = LOOPBACK_HOSTS.has(url.hostname)
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && loopback)
  if (!secure || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new ConfigurationError(`${label} debe ser un origen https limpio (sin ruta, query ni credenciales; http solo en loopback)`)
  }
  return url
}

export function readDestination(source: Source = process.env): Destination {
  const rawBase = source.BASE_URL ?? source.AUTH_ORIGIN
  if (!rawBase) throw new ConfigurationError('Falta BASE_URL (origen del Preview de test)')
  const base = cleanOrigin(rawBase, 'BASE_URL')
  const loopback = LOOPBACK_HOSTS.has(base.hostname)
  // El navegador enviará Origin = origen de la página, así que AUTH_ORIGIN debe coincidir con él.
  if (source.AUTH_ORIGIN && cleanOrigin(source.AUTH_ORIGIN, 'AUTH_ORIGIN').origin !== base.origin) {
    throw new ConfigurationError('AUTH_ORIGIN difiere de BASE_URL: el navegador enviaría un Origin no autorizado')
  }
  if (!loopback && !base.hostname.endsWith('.vercel.app')) {
    throw new ConfigurationError('El runner solo apunta a Previews *.vercel.app o a loopback; nunca a dominios propios o de terceros')
  }
  const bypassToken = source.SMOKE_BYPASS_TOKEN ?? source.SMOKE_VERCEL_BYPASS ?? null
  if (bypassToken && loopback) throw new ConfigurationError('El bypass de Preview no se usa con destinos loopback')
  const readyStamp = source.E2E_READY_STAMP ?? null
  if (!loopback && !readyStamp) {
    throw new ConfigurationError('Destino cloud sin ready de root: ejecuta el runner con scripts/e2e-run.mjs tras night-cloud-ready.json')
  }
  return {
    origin: base.origin,
    hostname: base.hostname,
    loopback,
    authOrigin: base.origin,
    bypassToken,
    readyStamp,
    previewSha: source.E2E_PREVIEW_SHA ?? null,
  }
}

export function readCredentials(source: Source = process.env): Credentials {
  const required = ['SMOKE_CUSTOMER_PHONE', 'SMOKE_CUSTOMER_PASSWORD', 'SMOKE_STAFF_EMAIL', 'SMOKE_STAFF_PASSWORD'] as const
  const missing = required.filter((name) => !source[name])
  if (missing.length > 0) throw new ConfigurationError(`Faltan credenciales de test por entorno: ${missing.join(', ')}`)
  const staff = { email: source.SMOKE_STAFF_EMAIL!, password: source.SMOKE_STAFF_PASSWORD! }
  return {
    customer: { phone: source.SMOKE_CUSTOMER_PHONE!, password: source.SMOKE_CUSTOMER_PASSWORD! },
    staff,
    owner: source.SMOKE_OWNER_EMAIL && source.SMOKE_OWNER_PASSWORD
      ? { email: source.SMOKE_OWNER_EMAIL, password: source.SMOKE_OWNER_PASSWORD }
      : staff,
  }
}

/** Celular nacional de 10 dígitos que espera el formulario (`+57` ya está fijo en la pantalla). */
export function nationalPhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}
