import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { publicCatalogResponseSchema, staffProductDtoSchema, storeDtoSchema } from '../../../shared/contracts/index.js'
import { HTTP_ORIGIN, HTTP_SECRET, bodyOf, statusOf } from '../auth/httpFixture.js'
import { call, operationRequest, setupWorld, type World } from '../http/catalogStoreFixture.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 90_000 })

/**
 * Handlers Vercel reales con `DB_DRIVER=postgres`: el factory crea los adapters de producción
 * y el cliente Neon, cuyo transporte HTTP se redirige a PostgreSQL embebido. Así se ejecuta
 * el SQL real de auth, catálogo y tienda. No contacta Neon ni Vercel: no acredita el smoke cloud.
 */
describe('API de catálogo y tienda sobre PostgreSQL embebido', () => {
  let embedded: EmbeddedPostgres
  let world: World

  beforeAll(async () => {
    vi.resetModules()
    vi.stubEnv('APP_ENV', 'local')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('DB_DRIVER', 'postgres')
    vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@localhost/fixture')
    vi.stubEnv('AUTH_JWT_SECRET', HTTP_SECRET)
    vi.stubEnv('AUTH_ORIGIN', HTTP_ORIGIN)
    embedded = await startEmbeddedPostgres()
    world = await setupWorld()
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    if (embedded) await embedded.close()
  })

  it('lectura pública desde filas persistidas', async () => {
    const res = await call('catalog', operationRequest())
    expect(statusOf(res)).toBe(200)
    const body = publicCatalogResponseSchema.parse(bodyOf(res))
    expect(body.products.map((p) => p.id)).toHaveLength(16)
    expect(body.categories[0]).toEqual({ id: 'cat-la', name: 'Lácteos', slug: 'lacteos', order: 1 })
  })

  it('alta del owner: la fila guarda la tienda de la sesión; owner ajeno no la edita', async () => {
    const res = await call('catalog', operationRequest({
      method: 'POST',
      query: { op: 'products' },
      cookie: world.owner.cookie,
      body: { name: 'Panela', price: 3200, unit: '500 g', imageUrl: '/p.png', categoryId: 'cat-dp', is_variable_weight: false },
    }))
    expect(statusOf(res)).toBe(201)
    const { id } = staffProductDtoSchema.parse(bodyOf(res))
    const { rows } = await embedded.pg.query<{ store_id: string; version: number }>(
      'select store_id, version from catalog_products where id = $1',
      [id],
    )
    expect(rows[0]).toEqual({ store_id: 'leche-y-miel', version: 1 })

    const foreign = await call('catalog', operationRequest({ method: 'PATCH', query: { op: 'product', id }, cookie: world.foreignOwner.cookie, body: { price: 1 } }))
    expect(statusOf(foreign)).toBe(404)
    const archived = await call('catalog', operationRequest({ method: 'PATCH', query: { op: 'product', id }, cookie: world.owner.cookie, body: { archived: true } }))
    expect(staffProductDtoSchema.parse(bodyOf(archived))).toMatchObject({ archived: true })
    expect((await embedded.pg.query('select 1 from catalog_products where id = $1 and archived_at is not null', [id])).rows).toHaveLength(1)
  })

  it('DELETE de categoría con productos responde 409 desde la FK; vacía 204', async () => {
    const inUse = await call('catalog', operationRequest({ method: 'DELETE', query: { op: 'category', id: 'cat-be' }, cookie: world.owner.cookie }))
    expect(statusOf(inUse)).toBe(409)
    expect(bodyOf(inUse)).toMatchObject({ error: 'CATEGORY_IN_USE' })

    const empty = await call('catalog', operationRequest({ method: 'DELETE', query: { op: 'category', id: 'cat-hr' }, cookie: world.owner.cookie }))
    expect(statusOf(empty)).toBe(204)
    expect((await embedded.pg.query(`select 1 from catalog_categories where id = 'cat-hr'`)).rows).toHaveLength(0)
  })

  it('tienda: PATCH del owner persiste y GET público lo refleja', async () => {
    const patch = await call('store', operationRequest({
      method: 'PATCH',
      query: { op: 'staff' },
      cookie: world.owner.cookie,
      body: { delivery: { freeShippingThreshold: 40000 }, contactPhone: '+57 310 123 4567' },
    }))
    expect(statusOf(patch)).toBe(200)
    const { rows } = await embedded.pg.query<{ free_shipping_threshold: number; contact_phone: string; version: number }>(
      `select free_shipping_threshold, contact_phone, version from stores where id = 'leche-y-miel'`,
    )
    expect(rows[0]).toEqual({ free_shipping_threshold: 40000, contact_phone: '573101234567', version: 2 })

    const view = storeDtoSchema.parse(bodyOf(await call('store', operationRequest())))
    expect(view.delivery.freeShippingThreshold).toBe(40000)
    expect(statusOf(await call('store', operationRequest({ method: 'PATCH', query: { op: 'staff' }, cookie: world.operator.cookie, body: { name: 'X' } })))).toBe(403)
  })
})
