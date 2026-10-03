import { describe, expect, it } from 'vitest'
import { ENTITY_ID_PATTERN } from '@shared/contracts'
import {
  CACHED_AT_HEADER,
  NAVIGATION_DENYLIST,
  PRODUCT_ID_PATTERN,
  SERVED_FROM_CACHE_HEADER,
  isExpired,
  isStorableImageResponse,
  isStorablePublicResponse,
  publicCatalogKey,
  servedFromCacheAt,
  staticImageKey,
  toServedCopy,
  toStoredCopy,
} from './cachePolicy'

const ORIGIN = 'https://maui.test'

type RequestOverrides = Partial<{ method: string; headers: HeadersInit; mode: string; destination: string }>
const request = (overrides: RequestOverrides = {}) => ({
  method: 'GET', mode: 'cors', destination: '', ...overrides, headers: new Headers(overrides.headers),
})
const keyFor = (path: string, overrides?: RequestOverrides) => publicCatalogKey(request(overrides), new URL(path, ORIGIN), ORIGIN)

/** Las `Response` construidas son `default`; las que devuelve `fetch` al mismo origen son `basic`. */
const basic = (body: BodyInit | null, init: ResponseInit = {}) => Object.defineProperty(new Response(body, init), 'type', { value: 'basic' })
const json = (headers: HeadersInit = {}) => basic('{}', { status: 200, headers: { 'content-type': 'application/json', ...headers } })

describe('publicCatalogKey', () => {
  it('acepta solo el catálogo público y el detalle de producto, sin query', () => {
    expect(keyFor('/api/catalog')).toBe(`${ORIGIN}/api/catalog`)
    expect(keyFor('/api/catalog/products/prod-leche_1.v2')).toBe(`${ORIGIN}/api/catalog/products/prod-leche_1.v2`)
  })

  it.each([
    '/api/catalog/staff', '/api/store', '/api/store/staff', '/api/orders', '/api/orders/ORD-1', '/api/auth/session',
    '/api/catalog?op=staff', '/api/catalog?x=1', '/api/catalog/products', '/api/catalog/products/', '/api/catalog/products/a/b',
    '/api/catalog/products/a%2Fb', '/api/catalog/products/-x', '/api/catalog/', '/api/catalogo', '/admin/api/catalog', '/catalog',
  ])('rechaza %s', (path) => {
    expect(keyFor(path)).toBeNull()
  })

  it('rechaza mutaciones, navegaciones, peticiones con Authorization y otros orígenes', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) expect(keyFor('/api/catalog', { method })).toBeNull()
    expect(keyFor('/api/catalog', { mode: 'navigate' })).toBeNull()
    expect(keyFor('/api/catalog', { headers: { Authorization: 'Bearer x' } })).toBeNull()
    expect(publicCatalogKey(request(), new URL('https://otro.test/api/catalog'), ORIGIN)).toBeNull()
  })

  it('el patrón de ID de producto coincide con el contrato compartido', () => {
    expect(`^${PRODUCT_ID_PATTERN}$`).toBe(ENTITY_ID_PATTERN.source)
  })
})

describe('staticImageKey', () => {
  const imageKey = (path: string, overrides: RequestOverrides = { destination: 'image' }) =>
    staticImageKey(request(overrides), new URL(path, ORIGIN), ORIGIN)

  it('acepta imágenes versionadas del mismo origen', () => {
    expect(imageKey('/assets/hero-AbC123.webp')).toBe(`${ORIGIN}/assets/hero-AbC123.webp`)
    expect(imageKey('/product-images/lacteos/leche.png')).toBe(`${ORIGIN}/product-images/lacteos/leche.png`)
  })

  it.each(['/api/orders/ORD-1/receipt.png', '/admin/assets/logo.png', '/icons/icon-512.png', '/assets/x.webp?v=1'])('rechaza %s', (path) => {
    expect(imageKey(path)).toBeNull()
  })

  it('rechaza otros orígenes, métodos y destinos', () => {
    expect(staticImageKey(request({ destination: 'image' }), new URL('https://cdn.test/assets/x.webp'), ORIGIN)).toBeNull()
    expect(imageKey('/assets/x.webp', { destination: 'image', method: 'POST' })).toBeNull()
    expect(imageKey('/assets/x.webp', { destination: 'script' })).toBeNull()
  })
})

describe('respuestas guardables', () => {
  it('guarda solo un 200 JSON básico sin señales de sesión', () => {
    expect(isStorablePublicResponse(json())).toBe(true)
    expect(isStorablePublicResponse(basic('{}', { status: 404, headers: { 'content-type': 'application/json' } }))).toBe(false)
    expect(isStorablePublicResponse(basic('{}', { status: 206, headers: { 'content-type': 'application/json' } }))).toBe(false)
    expect(isStorablePublicResponse(basic('x', { status: 200, headers: { 'content-type': 'text/html' } }))).toBe(false)
  })

  it('no guarda respuestas que no sean `basic` (opacas o de otro origen)', () => {
    const crossOrigin = Object.defineProperty(new Response('{}', { headers: { 'content-type': 'application/json' } }), 'type', { value: 'cors' })
    expect(isStorablePublicResponse(crossOrigin)).toBe(false)
  })

  it.each<Record<string, string>>([
    { 'cache-control': 'private' }, { 'cache-control': 'no-store' }, { 'cache-control': 'public, max-age=5, no-store' },
    { vary: 'Cookie' }, { vary: 'Accept, Cookie' }, { vary: 'Authorization' }, { vary: '*' },
  ])('no guarda una respuesta con %o', (headers) => {
    expect(isStorablePublicResponse(json(headers))).toBe(false)
  })

  it('las imágenes deben ser image/* básicas y no superar el máximo', () => {
    const image = (headers: HeadersInit) => basic('x', { status: 200, headers })
    expect(isStorableImageResponse(image({ 'content-type': 'image/webp', 'content-length': '1000' }))).toBe(true)
    expect(isStorableImageResponse(image({ 'content-type': 'image/webp', 'content-length': '2000000' }))).toBe(false)
    expect(isStorableImageResponse(image({ 'content-type': 'text/html' }))).toBe(false)
    expect(isStorableImageResponse(image({ 'content-type': 'image/png', 'cache-control': 'private' }))).toBe(false)
  })
})

describe('copia guardada', () => {
  it('conserva solo el tipo de contenido y marca cuándo se guardó', async () => {
    const stored = toStoredCopy(json({ 'x-request-id': 'abc', etag: '"1"' }), 1_700_000_000_000)
    expect([...stored.headers.keys()].sort()).toEqual(['content-type', CACHED_AT_HEADER])
    expect(stored.headers.get(CACHED_AT_HEADER)).toBe('1700000000000')
    expect(await stored.json()).toEqual({})
  })

  it('al servirla se marca como proveniente de la caché y expone la antigüedad', () => {
    const stored = toStoredCopy(json(), 1_700_000_000_000)
    expect(servedFromCacheAt(stored.headers)).toBeNull()
    const served = toServedCopy(stored)
    expect(served.headers.get(SERVED_FROM_CACHE_HEADER)).toBe('1')
    expect(servedFromCacheAt(served.headers)).toBe(1_700_000_000_000)
    expect(servedFromCacheAt(new Headers({ [SERVED_FROM_CACHE_HEADER]: '1' }))).toBeNull()
  })

  it('vence por TTL, por falta de marca o por una marca en el futuro', () => {
    const now = 1_700_000_000_000
    expect(isExpired(now - 1000, now, 5000)).toBe(false)
    expect(isExpired(now - 5001, now, 5000)).toBe(true)
    expect(isExpired(null, now, 5000)).toBe(true)
    expect(isExpired(now + 24 * 3_600_000, now, 5000)).toBe(true)
  })
})

describe('NAVIGATION_DENYLIST', () => {
  const denied = (path: string) => NAVIGATION_DENYLIST.some((pattern) => pattern.test(path))

  it.each(['/api', '/api/', '/api/orders', '/api?x=1', '/admin', '/admin/', '/admin/pedidos', '/sw.js', '/workbox-abc123.js', '/manifest.webmanifest'])(
    'excluye %s del fallback de la SPA', (path) => { expect(denied(path)).toBe(true) },
  )

  it.each(['/', '/pedidos/ORD-1.2', '/catalog/lacteos', '/administrador', '/apiary', '/checkout'])(
    'deja %s con el fallback de la SPA', (path) => { expect(denied(path)).toBe(false) },
  )
})
