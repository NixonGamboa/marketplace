/// <reference lib="webworker" />
// Service worker de la PWA (T-20). Precachea solo el app shell y delega en `pwa/` las dos únicas
// cachés de ejecución permitidas (catálogo público e imágenes versionadas). Todo lo demás —auth,
// pedidos, catálogo de personal, mutaciones, `/admin`— no tiene ruta aquí: va directo a la red y
// nunca se guarda ni se reenvía. No hay background sync.

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NAVIGATION_DENYLIST, publicCatalogKey, staticImageKey } from './pwa/cachePolicy'
import { handlePublicCatalog, handleStaticImage, purgeObsoleteCaches, type RuntimeCacheContext } from './pwa/runtimeCache'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> }

// Workbox entrega al handler lo que devolvió el matcher: aquí `{ key }` con la clave de caché.
const keyOf = (params: unknown): string => (params as { key: string }).key

const contextFor = (event: ExtendableEvent): RuntimeCacheContext => ({
  caches: self.caches,
  fetch: (input, init) => self.fetch(input, init),
  now: () => Date.now(),
  waitUntil: (work) => event.waitUntil(work),
})

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Rutas profundas de la SPA sin red; `/api` y `/admin` quedan fuera del fallback.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [...NAVIGATION_DENYLIST] }))

registerRoute(
  ({ request, url }) => {
    const key = publicCatalogKey(request, url, self.location.origin)
    return key === null ? null : { key }
  },
  ({ event, request, params }) => handlePublicCatalog(keyOf(params), request.headers.get('accept'), contextFor(event)),
)

registerRoute(
  ({ request, url }) => {
    const key = staticImageKey(request, url, self.location.origin)
    return key === null ? null : { key }
  },
  ({ event, params }) => handleStaticImage(keyOf(params), contextFor(event)),
)

// La versión nueva espera a que la persona acepte «Actualizar»: recargar sola podría cortar un pedido.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(purgeObsoleteCaches(self.caches))
})

clientsClaim()
