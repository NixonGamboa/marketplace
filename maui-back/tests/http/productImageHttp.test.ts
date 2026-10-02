import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRODUCT_IMAGE_LIMITS } from '../../../shared/contracts/media.js'
import { HTTP_ORIGIN, HTTP_SECRET, bodyOf, headerOf, statusOf } from '../auth/httpFixture.js'
import { call, operationRequest, setupWorld, type World } from './catalogStoreFixture.js'

const blob = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn() }))
vi.mock('@vercel/blob', () => blob)
const productId = 'queso-campesino-250g'
let world: World
let imageBase64: string

beforeAll(async () => {
  vi.resetModules()
  vi.stubEnv('APP_ENV', 'local')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('VERCEL_ENV', undefined)
  vi.stubEnv('VERCEL_GIT_COMMIT_REF', undefined)
  vi.stubEnv('DB_DRIVER', 'memory')
  vi.stubEnv('AUTH_JWT_SECRET', HTTP_SECRET)
  vi.stubEnv('AUTH_ORIGIN', HTTP_ORIGIN)
  world = await setupWorld()
  // Auth/BD memory se componen localmente; solo el adapter Blob usa configuración test.
  vi.stubEnv('APP_ENV', 'test')
  vi.stubEnv('BLOB_STORE_ID', 'store_Test123')
  vi.stubEnv('TEST_BLOB_STORE_ID', 'store_Test123')
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_Test123_unit-only')
  vi.stubEnv('TEST_BLOB_PUBLIC_HOST', 'test123.public.blob.vercel-storage.com')
  imageBase64 = (await sharp({ create: { width: 32, height: 16, channels: 3, background: 'red' } }).png().toBuffer()).toString('base64')
}, 60_000)

beforeEach(() => {
  blob.put.mockClear()
  blob.del.mockClear()
  blob.put.mockImplementation(async (pathname: string) => ({ pathname, url: `https://test123.public.blob.vercel-storage.com/${pathname}` }))
  blob.del.mockResolvedValue(undefined)
})
afterAll(() => vi.unstubAllEnvs())

const request = (cookie: string | undefined, body: unknown = { imageBase64 }, options: {
  id?: string; version?: string | string[]; headers?: Record<string, string | undefined>; method?: string;
} = {}) => call('catalog', operationRequest({
  method: options.method ?? 'POST', cookie, body,
  query: { op: 'image', id: options.id ?? productId, version: options.version ?? '1' },
  ...(options.headers === undefined ? {} : { headers: options.headers }),
}))

describe('POST imagen por Function catálogo: permisos y contrato HTTP', () => {
  it('401 sin sesión o cookie manipulada; borra cookie y no llama Blob', async () => {
    for (const cookie of [undefined, 'maui_session=manipulada']) {
      const res = await request(cookie)
      expect(statusOf(res)).toBe(401)
      expect(headerOf(res, 'Set-Cookie')).toMatch(/Max-Age=0/)
      expect(headerOf(res, 'Cache-Control')).toMatch(/no-store/)
    }
    expect(blob.put).not.toHaveBeenCalled()
  })
  it.each(['customer', 'operator'] as const)('403 %s antes de leer imagen y cobrar Blob', async role => {
    const req = operationRequest({ method: 'POST', cookie: world[role].cookie, query: { op: 'image', id: productId, version: '1' } })
    Object.defineProperty(req, 'body', { get() { throw new Error('No debe leer') } })
    expect(statusOf(await call('catalog', req))).toBe(403)
    expect(blob.put).not.toHaveBeenCalled()
  })
  it('403 sin Origin/extranjero; Content-Type 415 y cuerpo grande 413', async () => {
    for (const origin of [undefined, 'https://evil.test']) expect(statusOf(await request(world.owner.cookie, { imageBase64 }, { headers: { origin } }))).toBe(403)
    expect(statusOf(await request(world.owner.cookie, { imageBase64 }, { headers: { 'content-type': 'text/plain' } }))).toBe(415)
    expect(statusOf(await request(world.owner.cookie, { imageBase64 }, { headers: { 'content-length': String(PRODUCT_IMAGE_LIMITS.jsonBytes + 1) } }))).toBe(413)
    expect(blob.put).not.toHaveBeenCalled()
  })
  it('producto ajeno e inexistente son mismo 404 antes de body/Blob', async () => {
    const foreign = await request(world.foreignOwner.cookie)
    const missing = await request(world.owner.cookie, {}, { id: productId })
    const absent = await request(world.owner.cookie, {}, { id: 'no-existe' })
    expect(statusOf(foreign)).toBe(404)
    expect(statusOf(absent)).toBe(404)
    expect((bodyOf(foreign) as { error: string }).error).toBe((bodyOf(absent) as { error: string }).error)
    expect(statusOf(missing)).toBe(400)
    expect(blob.put).not.toHaveBeenCalled()
  })
  it.each(['0', '-1', '1.2', '', ['1', '2']])('versión inválida %j responde 400', async version => {
    expect(statusOf(await request(world.owner.cookie, {}, { version }))).toBe(400)
    expect(blob.put).not.toHaveBeenCalled()
  })
  it.each([{ imageBase64: '!!!!' }, { imageBase64: 'AA=A' }, { imageBase64: 'AB==' }, { imageBase64: 'R0lGODlh' },
    { imageBase64: 'PHN2Zy8+' }, { imageBase64: 'aG9sYQ==' }, { imageBase64: '', filename: 'x.png' }])('400 inválido %j sin storage', async body => {
    expect(statusOf(await request(world.owner.cookie, body))).toBe(400)
    expect(blob.put).not.toHaveBeenCalled()
  })
  it('runtime Production/master responde 503 sin tocar Blob', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(statusOf(await request(world.owner.cookie))).toBe(503)
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'master')
    expect(statusOf(await request(world.owner.cookie))).toBe(503)
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', undefined)
    expect(blob.put).not.toHaveBeenCalled()
  })
  it('200 real decode → WebP, URL snapshot, versión+1; stale 409 no nueva subida', async () => {
    const res = await request(world.owner.cookie)
    expect(statusOf(res)).toBe(200)
    const product = bodyOf(res) as { version: number; imageUrl: string }
    expect(product.version).toBe(2)
    expect(product.imageUrl).toMatch(/^https:\/\/test123\.public\.blob\.vercel-storage\.com\/test\/stores\/leche-y-miel\/products\/[a-f0-9-]+\.webp$/)
    expect(headerOf(res, 'Vary')).toContain('Cookie')
    const [pathname, bytes, options] = blob.put.mock.calls[0]!
    expect(pathname).not.toMatch(/queso|\.png/)
    expect((await sharp(bytes).metadata()).format).toBe('webp')
    expect(options).toMatchObject({ access: 'public', contentType: 'image/webp', allowOverwrite: false })
    expect(statusOf(await request(world.owner.cookie))).toBe(409)
    expect(blob.put).toHaveBeenCalledTimes(1)
    expect(blob.del).not.toHaveBeenCalled()
    const detail = await call('catalog', operationRequest({ query: { op: 'product', id: productId } }))
    expect((bodyOf(detail) as { imageUrl: string }).imageUrl).toBe(product.imageUrl)
  })
  it('503 del proveedor saneado sin filtrar token/detalle', async () => {
    blob.put.mockRejectedValueOnce(new Error('token secreto de proveedor'))
    const res = await request(world.owner.cookie, { imageBase64 }, { version: '2' })
    expect(statusOf(res)).toBe(503)
    expect(JSON.stringify(bodyOf(res))).not.toMatch(/token|secreto/)
  })
  it('429 al agotar cuota envía Retry-After antes de Blob', async () => {
    let limited
    for (let i = 0; i < 31; i++) {
      const response = await request(world.owner.cookie, { imageBase64: 'aG9sYQ==' }, { version: '2' })
      if (statusOf(response) === 429) { limited = response; break }
      expect(statusOf(response)).toBe(400)
    }
    expect(limited).toBeDefined()
    expect(Number(headerOf(limited!, 'Retry-After'))).toBeGreaterThan(0)
    expect(blob.put).not.toHaveBeenCalled()
  })
})
