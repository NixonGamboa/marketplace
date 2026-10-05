import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  productDtoSchema,
  publicCatalogResponseSchema,
  staffCatalogResponseSchema,
  staffProductDtoSchema,
  storeDtoSchema,
} from '../../../shared/contracts/index.js'
import { HTTP_ORIGIN, HTTP_SECRET, bodyOf, headerOf, statusOf } from '../auth/httpFixture.js'
import { call, operationRequest, setupWorld, type World } from './catalogStoreFixture.js'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

const unauthenticated = { error: 'UNAUTHENTICATED', message: 'Credenciales o sesión inválidas' }
const forbidden = { error: 'FORBIDDEN', message: 'No tiene permisos para esta operación' }

const newProduct = {
  name: 'Panela 500 g',
  price: 3200,
  unit: '500 g',
  imageUrl: '/product-images/abarrotes/panela.png',
  categoryId: 'cat-dp',
  is_variable_weight: false,
}

let world: World

beforeAll(async () => {
  vi.resetModules()
  vi.stubEnv('APP_ENV', 'local')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('VERCEL_ENV', undefined)
  vi.stubEnv('DB_DRIVER', 'memory')
  vi.stubEnv('AUTH_JWT_SECRET', HTTP_SECRET)
  vi.stubEnv('AUTH_ORIGIN', HTTP_ORIGIN)
  world = await setupWorld()
})

afterEach(() => vi.useRealTimers())
afterAll(() => vi.unstubAllEnvs())

const publicCatalog = async () => {
  const res = await call('catalog', operationRequest())
  expect(statusOf(res)).toBe(200)
  return publicCatalogResponseSchema.parse(bodyOf(res))
}

describe('GET /api/catalog público', () => {
  it('sin sesión devuelve un catálogo público revalidable y sin datos internos', async () => {
    const res = await call('catalog', operationRequest())
    expect(statusOf(res)).toBe(200)
    expect(headerOf(res, 'Cache-Control')).toBe('no-cache')
    expect(headerOf(res, 'Vary')).toBe('Origin')
    const body = publicCatalogResponseSchema.parse(bodyOf(res))
    expect(body.categories).toHaveLength(9)
    expect(body.products.length).toBeGreaterThanOrEqual(16)
    expect(JSON.stringify(body)).not.toMatch(/storeId|version|archived/)
  })

  it('cookies cliente, personal y manipulada no cambian el DTO público ni abren respuesta privada', async () => {
    const baseline = await call('catalog', operationRequest())
    for (const cookie of [world.customer.cookie, world.owner.cookie, 'maui_session=manipulada']) {
      const res = await call('catalog', operationRequest({ cookie }))
      expect(bodyOf(res)).toEqual(bodyOf(baseline))
      expect(headerOf(res, 'Cache-Control')).toBe('no-cache')
      expect(headerOf(res, 'Vary')).toBe('Origin')
      expect(headerOf(res, 'Set-Cookie')).toBeUndefined()
    }
    const staff = await call('catalog', operationRequest({ cookie: world.owner.cookie, query: { op: 'staff' } }))
    expect(headerOf(staff, 'Cache-Control')).toMatch(/no-store/)
    expect(headerOf(staff, 'Vary')).toMatch(/Cookie/)
  })

  it('detalle público válido, ID inválido 400 y desconocido 404', async () => {
    const ok = await call('catalog', operationRequest({ query: { op: 'product', id: 'queso-campesino-250g' } }))
    expect(headerOf(ok, 'Cache-Control')).toBe('no-cache')
    expect(headerOf(ok, 'Vary')).toBe('Origin')
    expect(productDtoSchema.parse(bodyOf(ok))).toMatchObject({ is_variable_weight: true, unit: 'Por Kilogramo', currency: 'COP' })
    expect(statusOf(await call('catalog', operationRequest({ query: { op: 'product', id: 'bad id' } })))).toBe(400)
    expect(statusOf(await call('catalog', operationRequest({ query: { op: 'product' } })))).toBe(400)
    const missing = await call('catalog', operationRequest({ query: { op: 'product', id: 'no-existe' } }))
    expect(statusOf(missing)).toBe(404)
    expect(headerOf(missing, 'Cache-Control')).toMatch(/no-store/)
  })

  it('operación desconocida o repetida responde 404 JSON; método no declarado 405 con Allow', async () => {
    for (const op of ['admin', '', ['staff', 'product']]) {
      const res = await call('catalog', operationRequest({ query: { op } }))
      expect(statusOf(res)).toBe(404)
      expect(bodyOf(res)).toEqual({ error: 'NOT_FOUND', message: 'Ruta API no encontrada' })
    }
    const res = await call('catalog', operationRequest({ method: 'POST', body: {} }))
    expect(statusOf(res)).toBe(405)
    expect(headerOf(res, 'Allow')).toBe('GET')
    expect(statusOf(await call('catalog', operationRequest({ query: { op: 'product', id: ['a', 'b'] } })))).toBe(400)
  })
})

describe('vista y CRUD de personal', () => {
  it('vista staff: 401 sin sesión, 403 cliente, 200 operator con su tienda', async () => {
    expect(bodyOf(await call('catalog', operationRequest({ query: { op: 'staff' } })))).toEqual(unauthenticated)
    expect(bodyOf(await call('catalog', operationRequest({ query: { op: 'staff' }, cookie: world.customer.cookie })))).toEqual(forbidden)
    const res = await call('catalog', operationRequest({ query: { op: 'staff' }, cookie: world.operator.cookie }))
    expect(statusOf(res)).toBe(200)
    expect(staffCatalogResponseSchema.parse(bodyOf(res)).products.length).toBeGreaterThanOrEqual(16)

    const foreign = await call('catalog', operationRequest({ query: { op: 'staff' }, cookie: world.foreignOwner.cookie }))
    expect(bodyOf(foreign)).toEqual({ categories: [], products: [] })
  })

  it('crear: origen, sesión y rol se comprueban antes de escribir; solo owner', async () => {
    const create = (cookie: string | undefined, headers: Record<string, string | undefined> = {}, body: unknown = newProduct) =>
      call('catalog', operationRequest({ method: 'POST', query: { op: 'products' }, cookie, body, headers }))

    expect(statusOf(await create(world.owner.cookie, { origin: 'https://evil.test' }))).toBe(403)
    expect(statusOf(await create(world.owner.cookie, { origin: undefined }))).toBe(403)
    expect(bodyOf(await create(undefined))).toEqual(unauthenticated)
    expect(bodyOf(await create(world.customer.cookie))).toEqual(forbidden)
    expect(bodyOf(await create(world.operator.cookie))).toEqual(forbidden)
    expect((await publicCatalog()).products.some((p) => p.name === 'Panela 500 g')).toBe(false)

    const res = await create(world.owner.cookie)
    expect(statusOf(res)).toBe(201)
    const created = staffProductDtoSchema.parse(bodyOf(res))
    expect(created).toMatchObject({ active: true, archived: false, inStock: true, currency: 'COP' })
    expect((await publicCatalog()).products.map((p) => p.id)).toContain(created.id)
  })

  it('el body no fija tienda ni ID; valores inválidos 400; tipo/tamaño 415/413', async () => {
    const create = (body: unknown, headers: Record<string, string | undefined> = {}) =>
      call('catalog', operationRequest({ method: 'POST', query: { op: 'products' }, cookie: world.owner.cookie, body, headers }))

    for (const body of [
      { ...newProduct, storeId: 'otra-tienda' },
      { ...newProduct, id: 'mi-id' },
      { ...newProduct, price: 3200.5 },
      { ...newProduct, currency: 'USD' },
      { ...newProduct, is_variable_weight: true },
      { ...newProduct, categoryId: 'cat-inexistente' },
    ]) {
      const res = await create(body)
      expect(statusOf(res), JSON.stringify(body)).toBe(400)
    }
    expect(statusOf(await create(newProduct, { 'content-type': 'text/plain' }))).toBe(415)
    expect(statusOf(await create({ ...newProduct, description: 'x'.repeat(20_000) }))).toBe(413)
  })

  it('PATCH: owner ajeno 404; agotado/inactivo/archivado se reflejan en público', async () => {
    const patch = (cookie: string, id: string, body: unknown) =>
      call('catalog', operationRequest({ method: 'PATCH', query: { op: 'product', id }, cookie, body }))

    expect(statusOf(await patch(world.foreignOwner.cookie, 'atun-lata-170g', { archived: true }))).toBe(404)
    expect(statusOf(await patch(world.operator.cookie, 'atun-lata-170g', { inStock: false }))).toBe(403)

    const soldOut = await patch(world.owner.cookie, 'atun-lata-170g', { inStock: false })
    expect(staffProductDtoSchema.parse(bodyOf(soldOut)).inStock).toBe(false)
    expect((await publicCatalog()).products.find((p) => p.id === 'atun-lata-170g')?.inStock).toBe(false)

    expect(statusOf(await patch(world.owner.cookie, 'atun-lata-170g', { archived: true }))).toBe(200)
    expect((await publicCatalog()).products.some((p) => p.id === 'atun-lata-170g')).toBe(false)
    expect(statusOf(await call('catalog', operationRequest({ query: { op: 'product', id: 'atun-lata-170g' } })))).toBe(404)

    expect(statusOf(await patch(world.owner.cookie, 'atun-lata-170g', { originalPrice: 100 }))).toBe(400)
    expect(statusOf(await patch(world.owner.cookie, 'atun-lata-170g', { archived: false }))).toBe(200)
  })

  it('categorías: crear/editar/borrar solo owner; con productos 409; ajena 404', async () => {
    const created = await call('catalog', operationRequest({ method: 'POST', query: { op: 'categories' }, cookie: world.owner.cookie, body: { name: 'Frutas', slug: 'frutas' } }))
    expect(statusOf(created)).toBe(201)
    const { id } = bodyOf(created) as { id: string }

    const dup = await call('catalog', operationRequest({ method: 'POST', query: { op: 'categories' }, cookie: world.owner.cookie, body: { name: 'Frutas 2', slug: 'frutas' } }))
    expect(statusOf(dup)).toBe(409)
    expect(bodyOf(dup)).toMatchObject({ error: 'CATEGORY_SLUG_TAKEN' })

    const renamed = await call('catalog', operationRequest({ method: 'PATCH', query: { op: 'category', id }, cookie: world.owner.cookie, body: { name: 'Frutas y verduras' } }))
    expect(bodyOf(renamed)).toMatchObject({ id, name: 'Frutas y verduras', slug: 'frutas' })

    const remove = (cookie: string, target: string) =>
      call('catalog', operationRequest({ method: 'DELETE', query: { op: 'category', id: target }, cookie }))
    const inUse = await remove(world.owner.cookie, 'cat-la')
    expect(statusOf(inUse)).toBe(409)
    expect(bodyOf(inUse)).toMatchObject({ error: 'CATEGORY_IN_USE' })
    expect(statusOf(await remove(world.foreignOwner.cookie, id))).toBe(404)
    expect(statusOf(await remove(world.operator.cookie, id))).toBe(403)
    const deleted = await remove(world.owner.cookie, id)
    expect(statusOf(deleted)).toBe(204)
    expect(deleted.end).toHaveBeenCalled()
  })
})

describe('GET/PATCH tienda', () => {
  const storeReq = (options: Parameters<typeof operationRequest>[0] = {}) => call('store', operationRequest(options))

  it('público: configuración y disponibilidad calculada en Bogotá, sin contacto ficticio', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T22:30:00.000Z')) // lunes 17:30 Bogotá
    const res = await storeReq()
    expect(statusOf(res)).toBe(200)
    const dto = storeDtoSchema.parse(bodyOf(res))
    expect(dto).toMatchObject({
      storeId: 'leche-y-miel',
      contactPhone: null,
      delivery: { shippingCost: 3000, freeShippingThreshold: 30000, coverageNote: 'Solo hay cobertura en el casco urbano de Dolores' },
      availability: { localTime: '17:30', isOpen: true, acceptsPickup: true, acceptsDelivery: true, availableTimeSlots: ['asap'] },
    })
  })

  it('staff: operator lee; solo owner edita; cliente 403; owner ajeno sin tienda 404', async () => {
    expect(statusOf(await storeReq({ query: { op: 'staff' }, cookie: world.operator.cookie }))).toBe(200)
    expect(bodyOf(await storeReq({ query: { op: 'staff' }, cookie: world.customer.cookie }))).toEqual(forbidden)
    expect(bodyOf(await storeReq({ query: { op: 'staff' } }))).toEqual(unauthenticated)

    const patch = (cookie: string, body: unknown, headers: Record<string, string | undefined> = {}) =>
      storeReq({ method: 'PATCH', query: { op: 'staff' }, cookie, body, headers })
    expect(statusOf(await patch(world.operator.cookie, { scheduleOverride: 'closed' }))).toBe(403)
    expect(statusOf(await patch(world.owner.cookie, { scheduleOverride: 'closed' }, { origin: 'https://evil.test' }))).toBe(403)
    expect(statusOf(await patch(world.foreignOwner.cookie, { name: 'Robada' }))).toBe(404)
    expect(statusOf(await patch(world.owner.cookie, { contactPhone: '573000000000' }))).toBe(400)
    expect(statusOf(await patch(world.owner.cookie, { storeId: 'otra-tienda', name: 'X' }))).toBe(400)

    const res = await patch(world.owner.cookie, { scheduleOverride: 'closed', contactPhone: '310 123 4567' })
    expect(statusOf(res)).toBe(200)
    expect(storeDtoSchema.parse(bodyOf(res))).toMatchObject({
      scheduleOverride: 'closed',
      contactPhone: '573101234567',
      availability: { isOpen: false, closedReason: 'override_closed', acceptsPickup: true, availableTimeSlots: ['morning', 'afternoon', 'asap'] },
    })
    const publicView = storeDtoSchema.parse(bodyOf(await storeReq()))
    expect(publicView.availability.isOpen).toBe(false)
    expect(statusOf(await patch(world.owner.cookie, { scheduleOverride: 'auto' }))).toBe(200)
  })

  it('operación desconocida 404 y método no permitido 405', async () => {
    expect(statusOf(await storeReq({ query: { op: 'settings' } }))).toBe(404)
    const res = await storeReq({ method: 'PATCH', body: { name: 'X' }, cookie: world.owner.cookie })
    expect(statusOf(res)).toBe(405)
    expect(headerOf(res, 'Allow')).toBe('GET')
  })
})
