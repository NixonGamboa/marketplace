// Estrategias de caché en tiempo de ejecución del service worker (T-20). Todas las dependencias del
// entorno (CacheStorage, fetch, reloj, waitUntil) se inyectan para probarlas sin un worker real.

import {
  LEGACY_CACHES,
  PUBLIC_CATALOG_CACHE,
  PUBLIC_CATALOG_LIMITS,
  PUBLIC_CATALOG_NETWORK_TIMEOUT_MS,
  RUNTIME_CACHES,
  STATIC_IMAGE_CACHE,
  STATIC_IMAGE_LIMITS,
  cachedAtOf,
  isExpired,
  isStorableImageResponse,
  isStorablePublicResponse,
  toServedCopy,
  toStoredCopy,
  type CacheLimits,
} from './cachePolicy'

export interface RuntimeCacheContext {
  caches: CacheStorage
  fetch: typeof fetch
  now(): number
  /** Trabajo que debe terminar aunque la respuesta ya se haya entregado (guardar, podar). */
  waitUntil(work: Promise<unknown>): void
}

/** Copia guardada si existe y no venció; una vencida se elimina. */
const readFresh = async (cache: Cache, key: string, limits: CacheLimits, now: number): Promise<Response | undefined> => {
  const stored = await cache.match(key)
  if (!stored) return undefined
  if (isExpired(cachedAtOf(stored), now, limits.maxAgeMs)) {
    await cache.delete(key)
    return undefined
  }
  return stored
}

/** Elimina las copias vencidas y, si aún sobran, las más antiguas hasta respetar `maxEntries`. */
const prune = async (cache: Cache, limits: CacheLimits, now: number): Promise<void> => {
  const entries = await Promise.all(
    (await cache.keys()).map(async (request) => {
      const stored = await cache.match(request)
      return { request, cachedAt: stored ? cachedAtOf(stored) : null }
    }),
  )
  const expired = entries.filter((entry) => isExpired(entry.cachedAt, now, limits.maxAgeMs))
  const newestFirst = entries
    .filter((entry) => !expired.includes(entry))
    .sort((a, b) => (b.cachedAt ?? 0) - (a.cachedAt ?? 0))
  const surplus = newestFirst.slice(limits.maxEntries)
  await Promise.all([...expired, ...surplus].map((entry) => cache.delete(entry.request)))
}

const storeCopy = async (cache: Cache, key: string, response: Response, limits: CacheLimits, ctx: RuntimeCacheContext): Promise<void> => {
  await cache.put(key, toStoredCopy(response, ctx.now()))
  await prune(cache, limits, ctx.now())
}

const timeoutAfter = (ms: number): { promise: Promise<null>; cancel(): void } => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const promise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return { promise, cancel: () => clearTimeout(timer) }
}

/**
 * Catálogo público: red primero y copia guardada como respaldo (sin red, 5xx o red lenta).
 * La petición a la red se rehace sin credenciales: la respuesta no puede depender de la sesión, y
 * lo que se guarda es una copia mínima (cuerpo + tipo), nunca las cabeceras del servidor.
 */
export const handlePublicCatalog = async (key: string, accept: string | null, ctx: RuntimeCacheContext): Promise<Response> => {
  const cache = await ctx.caches.open(PUBLIC_CATALOG_CACHE)
  const cached = await readFresh(cache, key, PUBLIC_CATALOG_LIMITS, ctx.now())

  const network = ctx.fetch(key, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: accept ?? 'application/json' },
  }).then((response) => {
    if (isStorablePublicResponse(response)) {
      ctx.waitUntil(storeCopy(cache, key, response.clone(), PUBLIC_CATALOG_LIMITS, ctx).catch(() => undefined))
    }
    return response
  })

  if (!cached) return network

  const timeout = timeoutAfter(PUBLIC_CATALOG_NETWORK_TIMEOUT_MS)
  const fromNetwork = await Promise.race([network.catch(() => null), timeout.promise])
  timeout.cancel()
  if (fromNetwork && fromNetwork.status < 500) return fromNetwork
  // La red sigue su curso en segundo plano para dejar la copia al día para la próxima visita.
  ctx.waitUntil(network.catch(() => undefined))
  return toServedCopy(cached)
}

/** Imágenes versionadas del propio origen: caché primero, con límite de entradas y de edad. */
export const handleStaticImage = async (key: string, ctx: RuntimeCacheContext): Promise<Response> => {
  const cache = await ctx.caches.open(STATIC_IMAGE_CACHE)
  const cached = await readFresh(cache, key, STATIC_IMAGE_LIMITS, ctx.now())
  if (cached) return cached
  const response = await ctx.fetch(key, { method: 'GET', credentials: 'omit' })
  if (isStorableImageResponse(response)) {
    ctx.waitUntil(storeCopy(cache, key, response.clone(), STATIC_IMAGE_LIMITS, ctx).catch(() => undefined))
  }
  return response
}

/** Borra cachés de versiones anteriores y toda caché `maui-*` que esta versión ya no gestiona. */
export const purgeObsoleteCaches = async (storage: CacheStorage): Promise<string[]> => {
  const obsolete = (await storage.keys()).filter(
    (name) => LEGACY_CACHES.includes(name) || (name.startsWith('maui-') && !RUNTIME_CACHES.includes(name)),
  )
  await Promise.all(obsolete.map((name) => storage.delete(name)))
  return obsolete
}
