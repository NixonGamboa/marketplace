// Política de caché del service worker (T-20). Funciones puras, sin globals del worker: las usan el
// worker y la app (la app solo lee las cabeceras que el worker marca en una copia guardada).
//
// Regla de fondo: lo privado jamás se guarda. Auth, pedidos, catálogo de personal, mutaciones y todo
// `/admin` viajan a la red sin pasar por el worker. Solo se guardan lecturas públicas listadas aquí,
// con ruta exacta, sin query, método GET, mismo origen y respuesta 200 sin señales de sesión.

export const PUBLIC_CATALOG_CACHE = 'maui-public-catalog-v1'
export const STATIC_IMAGE_CACHE = 'maui-static-images-v1'

/** Cachés anteriores a T-20 (el worker histórico guardaba imágenes sin límite y respuestas opacas). */
export const LEGACY_CACHES: readonly string[] = ['images-cache', 'api-cache']
export const RUNTIME_CACHES: readonly string[] = [PUBLIC_CATALOG_CACHE, STATIC_IMAGE_CACHE]

export interface CacheLimits {
  maxEntries: number
  maxAgeMs: number
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Catálogo: una copia vieja de precios no debe durar; pasadas 24 h sin red se muestra el error. */
export const PUBLIC_CATALOG_LIMITS: CacheLimits = { maxEntries: 24, maxAgeMs: DAY_MS }
/** Espera máxima a la red antes de mostrar la copia guardada (3G inestable). */
export const PUBLIC_CATALOG_NETWORK_TIMEOUT_MS = 4_000
/** Imágenes versionadas por hash del build: se pueden conservar más tiempo. */
export const STATIC_IMAGE_LIMITS: CacheLimits = { maxEntries: 80, maxAgeMs: 30 * DAY_MS }
export const MAX_CACHED_IMAGE_BYTES = 1_000_000

/** El worker marca cuándo se guardó la copia y que la respuesta salió de la caché, no de la red. */
export const CACHED_AT_HEADER = 'x-maui-cached-at'
export const SERVED_FROM_CACHE_HEADER = 'x-maui-served-from-cache'

/**
 * Rutas que nunca reciben el `index.html` de la SPA al navegar. Se evalúan contra `pathname + search`.
 * `/api` y `/admin` tienen su propio servidor; el límite de segmento evita capturar `/administrador`.
 */
export const NAVIGATION_DENYLIST: readonly RegExp[] = [
  /^\/api(?:[/?#]|$)/,
  /^\/admin(?:[/?#]|$)/,
  /^\/sw\.js$/,
  /^\/workbox-/,
  /^\/manifest\.webmanifest$/,
]

// Mismo patrón que `ENTITY_ID_PATTERN` de @shared/contracts (una prueba los compara). No se importa
// de allí para no empaquetar zod dentro del worker.
export const PRODUCT_ID_PATTERN = '[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}'
const PUBLIC_CATALOG_PATHS = [/^\/api\/catalog$/, new RegExp(`^/api/catalog/products/${PRODUCT_ID_PATTERN}$`)]
const STATIC_IMAGE_PREFIXES = ['/assets/', '/product-images/']

interface RequestLike {
  method: string
  headers: Headers
  mode?: string
  destination?: string
}

/** Clave de caché (URL sin query) si la petición es una lectura pública de catálogo; si no, `null`. */
export const publicCatalogKey = (request: RequestLike, url: URL, origin: string): string | null => {
  if (request.method !== 'GET' || url.origin !== origin || url.search !== '') return null
  // Una navegación a /api/* nunca pasa por el worker: solo `fetch` desde la app.
  if (request.mode === 'navigate' || request.headers.has('authorization')) return null
  return PUBLIC_CATALOG_PATHS.some((path) => path.test(url.pathname)) ? `${url.origin}${url.pathname}` : null
}

/** Clave de caché si es una imagen versionada servida por este mismo origen; si no, `null`. */
export const staticImageKey = (request: RequestLike, url: URL, origin: string): string | null => {
  if (request.method !== 'GET' || request.destination !== 'image' || url.origin !== origin || url.search !== '') return null
  return STATIC_IMAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ? `${url.origin}${url.pathname}` : null
}

const hasPrivateSignals = (response: Response): boolean => {
  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? ''
  const vary = response.headers.get('vary')?.toLowerCase() ?? ''
  return (
    response.headers.has('set-cookie') ||
    /\b(?:no-store|private)\b/.test(cacheControl) ||
    vary.includes('cookie') ||
    vary.includes('authorization') ||
    vary.trim() === '*'
  )
}

const isPlainSuccess = (response: Response): boolean =>
  response.status === 200 && response.type === 'basic' && !response.redirected && !hasPrivateSignals(response)

export const isStorablePublicResponse = (response: Response): boolean =>
  isPlainSuccess(response) && (response.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')

export const isStorableImageResponse = (response: Response): boolean => {
  if (!isPlainSuccess(response) || !(response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')) return false
  const length = Number(response.headers.get('content-length'))
  return !(Number.isFinite(length) && length > MAX_CACHED_IMAGE_BYTES)
}

export const cachedAtOf = (response: Pick<Response, 'headers'>): number | null => {
  const value = Number(response.headers.get(CACHED_AT_HEADER))
  return Number.isFinite(value) && value > 0 ? value : null
}

export const isExpired = (cachedAt: number | null, now: number, maxAgeMs: number): boolean =>
  cachedAt === null || now - cachedAt > maxAgeMs || cachedAt > now + HOUR_MS

/** Copia para guardar: cuerpo y tipo de contenido, sin ninguna otra cabecera del servidor. */
export const toStoredCopy = (response: Response, now: number): Response => {
  const headers = new Headers({ [CACHED_AT_HEADER]: String(now) })
  const contentType = response.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  return new Response(response.body, { status: 200, headers })
}

/** Misma copia, marcada como servida desde la caché para que la app muestre su antigüedad. */
export const toServedCopy = (stored: Response): Response => {
  const headers = new Headers(stored.headers)
  headers.set(SERVED_FROM_CACHE_HEADER, '1')
  return new Response(stored.body, { status: stored.status, headers })
}

/** Antigüedad (ms desde epoch del guardado) si la respuesta salió de la caché del worker; si no, `null`. */
export const servedFromCacheAt = (headers: Headers): number | null =>
  headers.get(SERVED_FROM_CACHE_HEADER) === '1' ? cachedAtOf({ headers }) : null
