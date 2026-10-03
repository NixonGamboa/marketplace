/**
 * Verifica el build de la PWA (`dist/`) contra la política de T-20, sin navegador:
 *  1. Presupuestos de peso (SW, precache, imágenes) medidos sobre lo que el worker realmente descarga.
 *  2. Manifest único y efectivo, iconos con las dimensiones declaradas y tags de iOS.
 *  3. Comportamiento del worker GENERADO (`dist/sw.js`): se ejecuta en un sandbox de Node con eventos
 *     install/activate/fetch y una CacheStorage en memoria. Comprueba que `/api` y `/admin` no reciben
 *     el fallback de la SPA, que auth/pedidos/catálogo de personal/mutaciones no se interceptan ni se
 *     guardan, y que el catálogo público se guarda acotado por ruta, TTL y número de entradas.
 *
 * Uso: `npm run verify:pwa` tras `vite build`. Termina con código 1 si algún criterio falla.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const ORIGIN = 'https://maui.test'
const KIB = 1024

/** Presupuestos: con ~15 % de margen sobre lo medido al cerrar T-20 (precache histórico: 29.026 KiB). */
const BUDGET = {
  precacheBytes: 700 * KIB,
  precacheEntryBytes: 450 * KIB,
  serviceWorkerBytes: 32 * KIB,
  imageBytes: 256 * KIB,
  imagesTotalBytes: 1536 * KIB,
}

const CATALOG_CACHE = 'maui-public-catalog-v1'
const IMAGE_CACHE = 'maui-static-images-v1'
const CATALOG_MAX_ENTRIES = 24
const CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000
const CONTENT_TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json',
}

const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}
const kib = (bytes) => `${(bytes / KIB).toFixed(1)} KiB`

const listFiles = (dir, base = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name), base) : [join(dir, entry.name).slice(base.length).replaceAll('\\', '/')],
  )

const pngSize = (file) => {
  const header = readFileSync(file)
  return `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`
}

// ─── Entorno simulado del worker ─────────────────────────────────────────────

const asBasic = (response) => Object.defineProperty(response, 'type', { value: 'basic' })

const createCacheStorage = () => {
  const stores = new Map()
  const keyOf = (input) => (typeof input === 'string' ? new URL(input, ORIGIN).href : input.url)
  const cacheOver = (entries) => ({
    match: async (input) => entries.get(keyOf(input))?.clone(),
    put: async (input, response) => void entries.set(keyOf(input), response),
    delete: async (input) => entries.delete(keyOf(input)),
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
    matchAll: async () => [...entries.values()].map((response) => response.clone()),
  })
  return {
    stores,
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map())
      return cacheOver(stores.get(name))
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    has: async (name) => stores.has(name),
    match: async (input, options = {}) => {
      const candidates = options.cacheName ? [stores.get(options.cacheName)] : [...stores.values()]
      for (const entries of candidates) {
        const hit = entries?.get(keyOf(input))
        if (hit) return hit.clone()
      }
      return undefined
    },
  }
}

/** Red simulada: sirve `dist/` y deja configurar la respuesta de cada ruta de API. */
const createNetwork = () => {
  const network = { mode: 'online', headers: {}, log: [] }
  network.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    network.log.push({ pathname: url.pathname, credentials: init.credentials ?? input.credentials })
    if (network.mode === 'offline') throw new TypeError('Failed to fetch')
    // Red lenta: responde (con fallo) mucho después del timeout del worker, que ya habrá servido la copia.
    if (network.mode === 'hang') return new Promise((_, reject) => setTimeout(() => reject(new TypeError('timeout')), 100))
    if (network.mode === 'error') return asBasic(new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } }))
    if (url.pathname.startsWith('/api/')) {
      const headers = { 'content-type': 'application/json', ...network.headers }
      return asBasic(new Response(JSON.stringify({ path: url.pathname }), { status: 200, headers }))
    }
    const file = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname)
    if (!existsSync(file) || !statSync(file).isFile()) return asBasic(new Response('not found', { status: 404 }))
    return asBasic(new Response(readFileSync(file), { status: 200, headers: { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' } }))
  }
  return network
}

const loadServiceWorker = ({ caches, network, clock }) => {
  const listeners = {}
  class FakeDate extends Date {
    static now() { return clock.now }
  }
  class FakeExtendableEvent {
    constructor(type, waits) {
      this.type = type
      this.waits = waits
    }
    waitUntil(work) { this.waits.push(Promise.resolve(work)) }
  }
  class FakeFetchEvent extends FakeExtendableEvent {
    constructor(request, waits) {
      super('fetch', waits)
      this.request = request
      this.pending = null
    }
    respondWith(response) { this.pending = Promise.resolve(response) }
  }
  // En un worker real las URL relativas (`index.html` del fallback) se resuelven contra su ubicación.
  class WorkerRequest extends Request {
    constructor(input, init) {
      super(typeof input === 'string' ? new URL(input, ORIGIN).href : input, init)
    }
  }
  const scope = {
    ExtendableEvent: FakeExtendableEvent,
    FetchEvent: FakeFetchEvent,
    console, URL, URLSearchParams, Request: WorkerRequest, Response, Headers, AbortController, Blob, ReadableStream, TextEncoder, structuredClone,
    Date: FakeDate,
    // El timeout de red del catálogo (segundos) se acorta para que la verificación sea rápida.
    setTimeout: (callback, ms) => setTimeout(callback, Math.min(ms, 20)),
    clearTimeout,
    caches,
    fetch: network.fetch,
    location: new URL(`${ORIGIN}/sw.js`),
    registration: { scope: `${ORIGIN}/` },
    clients: { claim: async () => {} },
    skipWaiting: async () => { scope.skipped = true },
    addEventListener: (type, listener) => (listeners[type] ??= []).push(listener),
  }
  scope.self = scope
  vm.createContext(scope)
  vm.runInContext(readFileSync(join(DIST, 'sw.js'), 'utf8'), scope, { filename: 'dist/sw.js' })

  const lifecycle = async (type) => {
    const waits = []
    for (const listener of listeners[type] ?? []) listener(new FakeExtendableEvent(type, waits))
    await Promise.all(waits)
  }

  const fetchEvent = async ({ url, method = 'GET', mode = 'cors', destination = '', headers = {} }) => {
    const request = { url: new URL(url, ORIGIN).href, method, mode, destination, headers: new Headers(headers), credentials: 'same-origin', clone() { return this } }
    const waits = []
    const event = new FakeFetchEvent(request, waits)
    for (const listener of listeners.fetch ?? []) listener(event)
    let response = null
    let error = null
    if (event.pending) {
      try { response = await event.pending } catch (caught) { error = caught }
    }
    await Promise.allSettled(waits)
    return { intercepted: event.pending !== null, response, error }
  }

  const message = (data) => (listeners.message ?? []).forEach((listener) => listener({ data }))

  return { scope, lifecycle, fetchEvent, message }
}

// ─── 1. Pesos ────────────────────────────────────────────────────────────────

if (!existsSync(join(DIST, 'sw.js'))) {
  console.error('✗ No hay dist/sw.js: ejecuta `vite build` antes de verificar.')
  process.exit(1)
}

const swBytes = statSync(join(DIST, 'sw.js')).size
check(swBytes <= BUDGET.serviceWorkerBytes, `sw.js pesa ${kib(swBytes)} (presupuesto ${kib(BUDGET.serviceWorkerBytes)})`)

const images = listFiles(DIST).filter((file) => /\.(png|webp|jpe?g|gif|avif)$/i.test(file) && !file.startsWith('admin/') && !file.startsWith('icons/'))
const imageSizes = images.map((file) => ({ file, bytes: statSync(join(DIST, file)).size }))
const imagesTotal = imageSizes.reduce((sum, image) => sum + image.bytes, 0)
for (const image of imageSizes) check(image.bytes <= BUDGET.imageBytes, `Imagen ${image.file} pesa ${kib(image.bytes)} (máximo ${kib(BUDGET.imageBytes)})`)
check(imagesTotal <= BUDGET.imagesTotalBytes, `Las imágenes de dist/ suman ${kib(imagesTotal)} (presupuesto ${kib(BUDGET.imagesTotalBytes)})`)

// ─── 2. Manifest, iconos y tags ──────────────────────────────────────────────

check(!existsSync(join(DIST, 'manifest.json')), 'Existe dist/manifest.json: debe haber un único manifest (manifest.webmanifest)')
const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf8')
const manifestLinks = indexHtml.match(/<link[^>]+rel="manifest"[^>]*>/g) ?? []
check(manifestLinks.length === 1 && manifestLinks[0].includes('/manifest.webmanifest'), `index.html debe enlazar exactamente un manifest (/manifest.webmanifest); encontrados: ${manifestLinks.length}`)

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'))
check(manifest.start_url === '/' && manifest.scope === '/' && manifest.id === '/', 'El manifest debe fijar id, start_url y scope en "/"')
check(manifest.display === 'standalone', 'El manifest debe usar display standalone')
check(Boolean(manifest.name && manifest.short_name && manifest.lang && manifest.theme_color && manifest.background_color), 'Faltan name, short_name, lang o colores en el manifest')
check(manifest.icons.some((icon) => icon.purpose === 'maskable'), 'El manifest necesita un icono maskable')
for (const icon of manifest.icons) {
  const file = join(DIST, icon.src)
  check(existsSync(file) && pngSize(file) === icon.sizes, `Icono ${icon.src}: no existe o sus dimensiones no son ${icon.sizes}`)
}
const appleIcon = indexHtml.match(/<link[^>]+rel="apple-touch-icon"[^>]*href="([^"]+)"/)
check(Boolean(appleIcon) && existsSync(join(DIST, appleIcon[1])) && pngSize(join(DIST, appleIcon[1])) === '180x180', 'Falta apple-touch-icon de 180x180 enlazado desde index.html')
for (const tag of ['apple-mobile-web-app-capable', 'apple-mobile-web-app-title', 'apple-mobile-web-app-status-bar-style', 'theme-color']) {
  check(indexHtml.includes(`name="${tag}"`), `index.html no declara <meta name="${tag}">`)
}
check(indexHtml.includes('viewport-fit=cover'), 'El viewport debe declarar viewport-fit=cover')

// ─── 3. Worker generado ──────────────────────────────────────────────────────

const clock = { now: Date.parse('2026-10-03T12:00:00Z') }
const caches = createCacheStorage()
const network = createNetwork()
const worker = loadServiceWorker({ caches, network, clock })

// Cachés de versiones anteriores que el worker debe retirar al activarse.
for (const legacy of ['images-cache', 'api-cache', 'maui-public-catalog-v0']) await caches.open(legacy)

await worker.lifecycle('install')
const precached = network.log.map((entry) => entry.pathname)
const precacheSizes = precached.map((pathname) => ({ pathname, bytes: statSync(join(DIST, pathname)).size }))
const precacheTotal = precacheSizes.reduce((sum, entry) => sum + entry.bytes, 0)
const largest = precacheSizes.reduce((max, entry) => (entry.bytes > max.bytes ? entry : max), { pathname: '-', bytes: 0 })
check(precacheTotal <= BUDGET.precacheBytes, `El precache suma ${kib(precacheTotal)} (presupuesto ${kib(BUDGET.precacheBytes)})`)
check(largest.bytes <= BUDGET.precacheEntryBytes, `Entrada de precache ${largest.pathname} pesa ${kib(largest.bytes)} (máximo ${kib(BUDGET.precacheEntryBytes)})`)
check(precached.includes('/index.html'), 'index.html debe estar en el precache (fallback de rutas profundas)')
check(precached.every((pathname) => !pathname.startsWith('/admin') && !pathname.startsWith('/api')), 'El precache no puede incluir /admin ni /api')
check(!precached.some((pathname) => /\.(png|webp|jpe?g)$/.test(pathname) && !pathname.startsWith('/icons/')), 'Las imágenes comerciales no deben estar en el precache (se guardan al verse)')

await worker.lifecycle('activate')
for (const legacy of ['images-cache', 'api-cache', 'maui-public-catalog-v0']) check(!(await caches.has(legacy)), `Caché obsoleta ${legacy} no fue retirada al activar`)
worker.message({ type: 'SKIP_WAITING' })
check(worker.scope.skipped === true, 'El worker debe activarse solo tras el mensaje SKIP_WAITING (no al instalarse)')

// Navegación: rutas profundas a la SPA; /api y /admin fuera del fallback.
for (const url of ['/pedidos/ORD-123', '/catalog/lacteos', '/checkout', '/administrador']) {
  const result = await worker.fetchEvent({ url, mode: 'navigate' })
  check(result.intercepted && result.response && (await result.response.text()).includes('<div id="root">'), `La navegación a ${url} debe resolver al index.html precacheado`)
}
for (const url of ['/api', '/api/orders', '/api/auth/session', '/api/health', '/api/catalog', '/api/catalog/products/P-1', '/api?x=1', '/admin', '/admin/pedidos', '/admin/index.html']) {
  const result = await worker.fetchEvent({ url, mode: 'navigate' })
  check(!result.intercepted, `La navegación a ${url} no debe pasar por el worker (ni fallback de la SPA ni caché)`)
}
// Archivos reales del origen: pueden salir del precache, pero nunca ser reemplazados por la SPA.
for (const url of ['/sw.js', '/manifest.webmanifest']) {
  const result = await worker.fetchEvent({ url, mode: 'navigate' })
  check(!result.intercepted || !(await result.response.text()).includes('<div id="root">'), `La navegación a ${url} no debe recibir el fallback de la SPA`)
}

// Peticiones privadas, mutaciones y rutas fuera de la lista: sin interceptar ni guardar.
const privateRequests = [
  { url: '/api/auth/session' }, { url: '/api/auth/login', method: 'POST' }, { url: '/api/auth/logout', method: 'POST' },
  { url: '/api/orders' }, { url: '/api/orders?limit=20' }, { url: '/api/orders/ORD-1' }, { url: '/api/orders/ORD-1/status' },
  { url: '/api/orders', method: 'POST' }, { url: '/api/orders/ORD-1/status', method: 'PATCH' },
  { url: '/api/catalog/staff' }, { url: '/api/store/staff' }, { url: '/api/store/staff', method: 'PATCH' }, { url: '/api/audit' },
  { url: '/api/catalog/products', method: 'POST' }, { url: '/api/catalog/products/P-1', method: 'PATCH' }, { url: '/api/catalog/categories/C-1', method: 'DELETE' },
  { url: '/api/catalog', method: 'POST' }, { url: '/api/catalog?op=staff' }, { url: '/api/catalog/products/P-1?x=1' }, { url: '/api/catalog/products/a%2Fb' },
  { url: '/api/catalog', headers: { Authorization: 'Bearer x' } }, { url: `https://otro.test/api/catalog` },
  { url: '/api/store' }, { url: '/admin/assets/app.js' }, { url: '/admin/api/orders' },
]
network.log.length = 0
for (const request of privateRequests) {
  const result = await worker.fetchEvent(request)
  check(!result.intercepted, `${request.method ?? 'GET'} ${request.url} no debe pasar por el worker (ni guardarse ni reenviarse)`)
}
check(network.log.length === 0, 'El worker hizo peticiones de red por rutas privadas')

// Catálogo público: red primero, copia como respaldo, límites de TTL y entradas.
const fromNetwork = await worker.fetchEvent({ url: '/api/catalog', headers: { Accept: 'application/json' } })
check(fromNetwork.intercepted && fromNetwork.response.status === 200 && !fromNetwork.response.headers.has('x-maui-served-from-cache'), 'GET /api/catalog con red debe responder 200 desde la red')
check(network.log.at(-1)?.credentials === 'omit', 'El worker debe pedir el catálogo público sin credenciales (sin sesión)')
const catalogStore = caches.stores.get(CATALOG_CACHE)
check(catalogStore?.size === 1, 'La respuesta del catálogo público debe guardarse (1 entrada)')
const storedCatalog = [...(catalogStore?.values() ?? [])][0]
check([...(storedCatalog?.headers.keys() ?? [])].sort().join() === 'content-type,x-maui-cached-at', 'La copia guardada solo conserva content-type y x-maui-cached-at')

network.mode = 'offline'
clock.now += 60 * 60 * 1000
const offline = await worker.fetchEvent({ url: '/api/catalog' })
check(offline.response?.headers.get('x-maui-served-from-cache') === '1' && Number(offline.response.headers.get('x-maui-cached-at')) === clock.now - 60 * 60 * 1000, 'Sin red debe servirse la copia marcada con su instante de guardado')
network.mode = 'hang'
const slow = await worker.fetchEvent({ url: '/api/catalog' })
check(slow.response?.headers.get('x-maui-served-from-cache') === '1', 'Con red colgada debe servirse la copia tras el timeout')
network.mode = 'error'
const failing = await worker.fetchEvent({ url: '/api/catalog' })
check(failing.response?.headers.get('x-maui-served-from-cache') === '1', 'Con 5xx del servidor debe servirse la copia')
network.mode = 'online'
const refreshed = await worker.fetchEvent({ url: '/api/catalog' })
check(refreshed.response.status === 200 && !refreshed.response.headers.has('x-maui-served-from-cache'), 'Al volver la red se responde desde el servidor')

network.mode = 'offline'
clock.now += CATALOG_MAX_AGE_MS + 1
const expired = await worker.fetchEvent({ url: '/api/catalog' })
check(expired.error !== null, 'Una copia vencida (TTL) no se sirve: la petición falla como cualquier corte de red')
check(catalogStore.size === 0, 'La copia vencida debe eliminarse de la caché')
network.mode = 'online'

for (const [index, cacheControl] of ['private', 'no-store', 'public, no-store'].entries()) {
  network.headers = { 'cache-control': cacheControl }
  await worker.fetchEvent({ url: `/api/catalog/products/CC-${index}` })
}
network.headers = { vary: 'Cookie' }
await worker.fetchEvent({ url: '/api/catalog/products/VARY-1' })
network.headers = { 'content-type': 'text/html' }
await worker.fetchEvent({ url: '/api/catalog/products/HTML-1' })
network.headers = {}
check(catalogStore.size === 0, 'No se guardan respuestas con Cache-Control private/no-store, Vary: Cookie ni un tipo distinto de JSON')

for (let index = 0; index < CATALOG_MAX_ENTRIES + 6; index += 1) {
  clock.now += 1000
  await worker.fetchEvent({ url: `/api/catalog/products/P-${index}` })
}
check(catalogStore.size === CATALOG_MAX_ENTRIES, `La caché de catálogo debe acotarse a ${CATALOG_MAX_ENTRIES} entradas; tiene ${catalogStore.size}`)
check(!catalogStore.has(`${ORIGIN}/api/catalog/products/P-0`) && catalogStore.has(`${ORIGIN}/api/catalog/products/P-${CATALOG_MAX_ENTRIES + 5}`), 'Al superar el límite se eliminan las entradas más antiguas')

// Imágenes versionadas: solo mismo origen, /assets/, con caché primero.
const imageFile = images.find((file) => file.startsWith('assets/')) ?? null
check(imageFile !== null, 'dist/assets no contiene imágenes para verificar la caché de imágenes')
if (imageFile) {
  network.mode = 'online'
  const first = await worker.fetchEvent({ url: `/${imageFile}`, destination: 'image' })
  check(first.intercepted && first.response.status === 200, `La imagen /${imageFile} debe resolverse desde la red la primera vez`)
  network.mode = 'offline'
  const second = await worker.fetchEvent({ url: `/${imageFile}`, destination: 'image' })
  check(second.response?.status === 200, 'La imagen ya vista debe servirse sin red')
  network.mode = 'online'
  check(!(await worker.fetchEvent({ url: 'https://cdn.otro.test/assets/x.webp', destination: 'image' })).intercepted, 'Las imágenes de otro origen no deben pasar por el worker')
  check(!(await worker.fetchEvent({ url: '/api/orders/ORD-1/receipt.png', destination: 'image' })).intercepted, 'Una imagen bajo /api no debe pasar por el worker')
}

// Estado final de las cachés: solo nombres y rutas permitidos, sin rastro privado.
const allowedCaches = new Set([CATALOG_CACHE, IMAGE_CACHE])
const publicCatalogPath = /^\/api\/catalog(?:\/products\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,63})?$/
for (const [name, entries] of caches.stores) {
  const precacheCache = name.startsWith('workbox-precache')
  check(allowedCaches.has(name) || precacheCache, `Caché inesperada tras las pruebas: ${name}`)
  for (const key of entries.keys()) {
    const { pathname, search } = new URL(key)
    check(!pathname.startsWith('/admin'), `Hay una entrada de /admin en la caché ${name}`)
    check(!pathname.startsWith('/api') || (name === CATALOG_CACHE && publicCatalogPath.test(pathname) && search === ''), `Entrada de API no permitida en ${name}: ${pathname}${search}`)
  }
}

// ─── Informe ─────────────────────────────────────────────────────────────────

const metrics = {
  serviceWorkerKiB: Number((swBytes / KIB).toFixed(1)),
  precacheEntries: precached.length,
  precacheKiB: Number((precacheTotal / KIB).toFixed(1)),
  largestPrecacheEntry: `${largest.pathname} ${kib(largest.bytes)}`,
  imageAssets: imageSizes.length,
  imagesTotalKiB: Number((imagesTotal / KIB).toFixed(1)),
  largestImageKiB: Number((Math.max(0, ...imageSizes.map((image) => image.bytes)) / KIB).toFixed(1)),
}
console.log(`PWA_METRICS ${JSON.stringify(metrics)}`)
if (failures.length > 0) {
  console.error(`✗ verify-pwa-build: ${failures.length} criterio(s) fallaron:`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`✓ verify-pwa-build: worker, manifest y presupuestos correctos (precache ${kib(precacheTotal)}, sw.js ${kib(swBytes)}).`)
