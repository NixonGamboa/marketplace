import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PUBLIC_CATALOG_CACHE,
  PUBLIC_CATALOG_LIMITS,
  STATIC_IMAGE_CACHE,
  STATIC_IMAGE_LIMITS,
} from './cachePolicy'
import { handlePublicCatalog, handleStaticImage, purgeObsoleteCaches, type RuntimeCacheContext } from './runtimeCache'

const NOW = Date.parse('2026-10-03T12:00:00Z')
const CATALOG_KEY = 'https://maui.test/api/catalog'

const keyOf = (input: RequestInfo | URL) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)

/** CacheStorage mínima en memoria: suficiente para las estrategias, sin un worker real. */
function createCaches() {
  const stores = new Map<string, Map<string, Response>>()
  const cacheOver = (entries: Map<string, Response>) => ({
    match: async (input: RequestInfo | URL) => entries.get(keyOf(input))?.clone(),
    put: async (input: RequestInfo | URL, response: Response) => void entries.set(keyOf(input), response),
    delete: async (input: RequestInfo | URL) => entries.delete(keyOf(input)),
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
  }) as unknown as Cache
  const storage = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map())
      return cacheOver(stores.get(name)!)
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  } as unknown as CacheStorage
  return { stores, storage }
}

const basic = (body: BodyInit | null, init: ResponseInit = {}) => Object.defineProperty(new Response(body, init), 'type', { value: 'basic' })
const jsonResponse = (body: unknown, headers: HeadersInit = {}) =>
  basic(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } })

describe('caché de ejecución', () => {
  let clock: number
  let caches: ReturnType<typeof createCaches>
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
  let pending: Promise<unknown>[]
  let ctx: RuntimeCacheContext

  const settle = () => Promise.allSettled(pending)

  beforeEach(() => {
    clock = NOW
    caches = createCaches()
    fetchMock = vi.fn<typeof fetch>()
    pending = []
    ctx = { caches: caches.storage, fetch: fetchMock, now: () => clock, waitUntil: (work) => void pending.push(work) }
  })

  describe('catálogo público', () => {
    it('conserva protección del mismo origen y guarda solo una copia pública mínima', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ products: [] }, { 'x-request-id': 'abc' }))
      const response = await handlePublicCatalog(CATALOG_KEY, 'application/json', ctx)
      await settle()

      expect(await response.json()).toEqual({ products: [] })
      expect(fetchMock).toHaveBeenCalledWith(CATALOG_KEY, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      const stored = caches.stores.get(PUBLIC_CATALOG_CACHE)!.get(CATALOG_KEY)!
      expect([...stored.headers.keys()].sort()).toEqual(['content-type', 'x-maui-cached-at'])
      expect(stored.headers.get('x-maui-cached-at')).toBe(String(NOW))
    })

    it('sin red sirve la copia marcada con su instante de guardado', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ v: 1 }))
      await handlePublicCatalog(CATALOG_KEY, null, ctx)
      await settle()

      clock += 60 * 60 * 1000
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      const offline = await handlePublicCatalog(CATALOG_KEY, null, ctx)
      expect(await offline.json()).toEqual({ v: 1 })
      expect(offline.headers.get('x-maui-served-from-cache')).toBe('1')
      expect(offline.headers.get('x-maui-cached-at')).toBe(String(NOW))
    })

    it('ante un 5xx sirve la copia; ante un 404 respeta al servidor', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ v: 1 }))
      await handlePublicCatalog(CATALOG_KEY, null, ctx)
      await settle()

      fetchMock.mockResolvedValueOnce(basic('{}', { status: 503 }))
      expect((await handlePublicCatalog(CATALOG_KEY, null, ctx)).headers.get('x-maui-served-from-cache')).toBe('1')

      fetchMock.mockResolvedValueOnce(basic('{}', { status: 404, headers: { 'content-type': 'application/json' } }))
      const notFound = await handlePublicCatalog(CATALOG_KEY, null, ctx)
      expect(notFound.status).toBe(404)
      expect(notFound.headers.has('x-maui-served-from-cache')).toBe(false)
    })

    it('con la red colgada sirve la copia tras el timeout y deja que la red actualice la caché', async () => {
      vi.useFakeTimers()
      try {
        fetchMock.mockResolvedValueOnce(jsonResponse({ v: 1 }))
        await handlePublicCatalog(CATALOG_KEY, null, ctx)
        await settle()

        let finishNetwork!: (response: Response) => void
        fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finishNetwork = resolve }))
        const served = handlePublicCatalog(CATALOG_KEY, null, ctx)
        await vi.advanceTimersByTimeAsync(4_001)
        expect((await served).headers.get('x-maui-served-from-cache')).toBe('1')

        clock += 5000
        finishNetwork(jsonResponse({ v: 2 }))
        await settle()
        const stored = caches.stores.get(PUBLIC_CATALOG_CACHE)!.get(CATALOG_KEY)!
        expect(await stored.json()).toEqual({ v: 2 })
      } finally {
        vi.useRealTimers()
      }
    })

    it('una copia vencida no se sirve y se elimina; el fallo de red llega a la app', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ v: 1 }))
      await handlePublicCatalog(CATALOG_KEY, null, ctx)
      await settle()

      clock += PUBLIC_CATALOG_LIMITS.maxAgeMs + 1
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await expect(handlePublicCatalog(CATALOG_KEY, null, ctx)).rejects.toThrow('Failed to fetch')
      expect(caches.stores.get(PUBLIC_CATALOG_CACHE)!.size).toBe(0)
    })

    it.each<Record<string, string>>([
      { 'cache-control': 'private' }, { 'cache-control': 'no-store' }, { vary: 'Cookie' }, { 'content-type': 'text/html' },
    ])('no guarda una respuesta con %o', async (headers) => {
      fetchMock.mockResolvedValue(jsonResponse({}, headers))
      await handlePublicCatalog(CATALOG_KEY, null, ctx)
      await settle()
      expect(caches.stores.get(PUBLIC_CATALOG_CACHE)!.size).toBe(0)
    })

    it('guarda la respuesta pública real del backend (no-cache + Vary: Origin) y rechaza la restrictiva', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ v: 1 }, { 'cache-control': 'no-cache', pragma: 'no-cache', vary: 'Origin' }))
      await handlePublicCatalog(CATALOG_KEY, null, ctx)
      await settle()
      expect(caches.stores.get(PUBLIC_CATALOG_CACHE)!.size).toBe(1)

      caches.stores.get(PUBLIC_CATALOG_CACHE)!.clear()
      fetchMock.mockResolvedValueOnce(jsonResponse({ v: 1 }, { 'cache-control': 'no-store, no-cache, max-age=0, must-revalidate', vary: 'Cookie, Origin' }))
      await handlePublicCatalog(CATALOG_KEY, null, ctx)
      await settle()
      expect(caches.stores.get(PUBLIC_CATALOG_CACHE)!.size).toBe(0)
    })

    it('no guarda errores ni respuestas que no sean 200', async () => {
      fetchMock.mockResolvedValueOnce(basic('{}', { status: 500, headers: { 'content-type': 'application/json' } }))
      await handlePublicCatalog(CATALOG_KEY, null, ctx)
      await settle()
      expect(caches.stores.get(PUBLIC_CATALOG_CACHE)!.size).toBe(0)
    })

    it('limita las entradas eliminando las más antiguas', async () => {
      const total = PUBLIC_CATALOG_LIMITS.maxEntries + 5
      for (let index = 0; index < total; index += 1) {
        clock += 1000
        fetchMock.mockResolvedValueOnce(jsonResponse({ index }))
        await handlePublicCatalog(`https://maui.test/api/catalog/products/P-${index}`, null, ctx)
        await settle()
      }
      const entries = caches.stores.get(PUBLIC_CATALOG_CACHE)!
      expect(entries.size).toBe(PUBLIC_CATALOG_LIMITS.maxEntries)
      expect(entries.has('https://maui.test/api/catalog/products/P-0')).toBe(false)
      expect(entries.has(`https://maui.test/api/catalog/products/P-${total - 1}`)).toBe(true)
    })
  })

  describe('imágenes versionadas', () => {
    const IMAGE_KEY = 'https://maui.test/assets/hero-abc.webp'
    const image = (headers: HeadersInit = { 'content-type': 'image/webp' }) => basic('img', { status: 200, headers })

    it('caché primero: la segunda vista no usa la red', async () => {
      fetchMock.mockResolvedValue(image())
      await handleStaticImage(IMAGE_KEY, ctx)
      await settle()
      const second = await handleStaticImage(IMAGE_KEY, ctx)
      expect(await second.text()).toBe('img')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(IMAGE_KEY, { method: 'GET', credentials: 'same-origin' })
    })

    it('no guarda respuestas no válidas ni demasiado grandes', async () => {
      fetchMock.mockResolvedValueOnce(basic('x', { status: 404, headers: { 'content-type': 'image/webp' } }))
      fetchMock.mockResolvedValueOnce(image({ 'content-type': 'image/webp', 'content-length': '5000000' }))
      fetchMock.mockResolvedValueOnce(image({ 'content-type': 'text/html' }))
      for (let attempt = 0; attempt < 3; attempt += 1) await handleStaticImage(IMAGE_KEY, ctx)
      await settle()
      expect(caches.stores.get(STATIC_IMAGE_CACHE)!.size).toBe(0)
    })

    it('limita las entradas y vence por edad', async () => {
      for (let index = 0; index < STATIC_IMAGE_LIMITS.maxEntries + 3; index += 1) {
        clock += 1000
        fetchMock.mockResolvedValueOnce(image())
        await handleStaticImage(`https://maui.test/assets/i-${index}.webp`, ctx)
        await settle()
      }
      expect(caches.stores.get(STATIC_IMAGE_CACHE)!.size).toBe(STATIC_IMAGE_LIMITS.maxEntries)

      clock += STATIC_IMAGE_LIMITS.maxAgeMs + 1
      fetchMock.mockResolvedValueOnce(image())
      await handleStaticImage('https://maui.test/assets/i-nueva.webp', ctx)
      await settle()
      expect([...caches.stores.get(STATIC_IMAGE_CACHE)!.keys()]).toEqual(['https://maui.test/assets/i-nueva.webp'])
    })
  })

  it('purgeObsoleteCaches retira cachés históricas y maui-* desconocidas, y respeta las vigentes y las de workbox', async () => {
    for (const name of ['images-cache', 'api-cache', 'maui-public-catalog-v0', PUBLIC_CATALOG_CACHE, STATIC_IMAGE_CACHE, 'workbox-precache-v2-x']) {
      await caches.storage.open(name)
    }
    expect((await purgeObsoleteCaches(caches.storage)).sort()).toEqual(['api-cache', 'images-cache', 'maui-public-catalog-v0'])
    expect((await caches.storage.keys()).sort()).toEqual([PUBLIC_CATALOG_CACHE, STATIC_IMAGE_CACHE, 'workbox-precache-v2-x'].sort())
  })
})
