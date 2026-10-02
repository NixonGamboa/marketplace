import { randomUUID } from 'node:crypto'
import type { VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { auditListResponseSchema, type AuditListResponse } from '../../../shared/contracts/audit.js'
import type { Repositories } from '../../src/infra/factory.js'
import { HTTP_ORIGIN, HTTP_SECRET, authRequest, bodyOf, cookiePair, headerOf, mockResponse, statusOf } from '../auth/httpFixture.js'
import { initializeOrderCatalog } from '../orders/creationFixture.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })
const STORE = 'leche-y-miel'
const paths = {
  audit: () => import('../../../api/audit.js'),
  register: () => import('../../../api/auth/register.js'),
  login: () => import('../../../api/auth/login.js'),
  orders: () => import('../../../api/orders/index.js'),
  status: () => import('../../../api/orders/[id]/status.js'),
  items: () => import('../../../api/orders/[id].js'),
  catalog: () => import('../../../api/catalog.js'),
  store: () => import('../../../api/store.js'),
}
describe('T-13: auditoría comercial PostgreSQL y HTTP con sesión real', () => {
  let embedded: EmbeddedPostgres, repositories: Repositories
  const actors = {} as Record<'customer' | 'owner' | 'operator' | 'foreign', { id: string; cookie: string }>
  async function call(route: keyof typeof paths, method: string, cookie?: string, query: Record<string, unknown> = {}, body?: unknown, headers: Record<string, string> = {}) {
    const { default: handler } = await paths[route]()
    const req = Object.assign(authRequest({ method, headers: { cookie, origin: method === 'GET' ? undefined : HTTP_ORIGIN, ...headers }, body }), { query })
    const res = mockResponse()
    await handler(req, res as unknown as VercelResponse)
    return res
  }
  async function list(query: Record<string, unknown> = {}, actor = actors.owner): Promise<AuditListResponse> {
    const res = await call('audit', 'GET', actor.cookie, query)
    expect(statusOf(res), JSON.stringify(bodyOf(res))).toBe(200)
    expect(headerOf(res, 'Cache-Control')).toContain('no-store')
    expect(headerOf(res, 'Vary')).toContain('Cookie')
    return auditListResponseSchema.parse(bodyOf(res))
  }
  async function place(key = randomUUID()) {
    const res = await call('orders', 'POST', actors.customer.cookie, {}, {
      userId: actors.customer.id, customerName: 'NOMBRE PRIVADO', customerPhone: '3001234567',
      deliveryType: 'pickup', deliveryData: {}, substitutionPreference: 'similar',
      items: [{ id: 'prod_leche', qty: 2 }, { id: 'prod_carne', qty: 1, kilosRequested: 1 }],
    }, { 'idempotency-key': key })
    expect(statusOf(res), JSON.stringify(bodyOf(res))).toBe(201)
    return (bodyOf(res) as { orderId: string }).orderId
  }
  const count = async () => (await embedded.pg.query<{ n: number }>('select count(*)::int n from audit_events')).rows[0]!.n
  beforeAll(async () => {
    vi.resetModules()
    for (const [key, value] of Object.entries({ APP_ENV: 'local', NODE_ENV: 'test', DB_DRIVER: 'postgres', DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture', AUTH_JWT_SECRET: HTTP_SECRET, AUTH_ORIGIN: HTTP_ORIGIN })) vi.stubEnv(key, value)
    vi.stubEnv('VERCEL_ENV', undefined)
    embedded = await startEmbeddedPostgres()
    const { getRepositories } = await import('../../src/infra/factory.js')
    const { getAuthRuntime } = await import('../../src/infra/auth/factory.js')
    repositories = await getRepositories()
    const { deps } = await getAuthRuntime()
    await initializeOrderCatalog({ ...repositories, clock: deps.clock })
    const registered = await call('register', 'POST', undefined, {}, { name: 'Cliente', phone: '3001234567', password: 'clave-cliente-segura' })
    expect(statusOf(registered)).toBe(201)
    actors.customer = { id: (bodyOf(registered) as { account: { id: string } }).account.id, cookie: cookiePair(registered) }
    const { createStaffAccount } = await import('../../src/usecases/auth/createStaffAccount.js')
    for (const role of ['owner', 'operator', 'foreign'] as const) {
      const email = `${role}@audit.test`, password = 'clave-personal-segura'
      const account = await createStaffAccount(deps, { name: 'Persona', role: role === 'foreign' ? 'owner' : role, storeId: role === 'foreign' ? 'otra-tienda' : STORE, email, password })
      const login = await call('login', 'POST', undefined, {}, { method: 'email', email, password })
      expect(statusOf(login)).toBe(200)
      actors[role] = { id: account.id, cookie: cookiePair(login) }
    }
  })
  afterAll(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); if (embedded) await embedded.close() })

  it('auth fresca, precedencia de permisos, lectura de solo su tienda y método protegido', async () => {
    expect(statusOf(await call('audit', 'GET', undefined, { storeId: STORE }))).toBe(401)
    expect(statusOf(await call('audit', 'GET', actors.customer.cookie, { storeId: STORE }))).toBe(403)
    expect(statusOf(await call('audit', 'GET', actors.owner.cookie, { storeId: 'otra-tienda' }))).toBe(400)
    expect((await list({}, actors.foreign)).items).toEqual([])
    expect((await list({}, actors.operator)).items.length).toBeGreaterThan(0)
    expect(statusOf(await call('audit', 'POST', actors.owner.cookie))).toBe(405)
    await embedded.pg.query("update auth_accounts set status='disabled' where id=$1", [actors.operator.id])
    expect(statusOf(await call('audit', 'GET', actors.operator.cookie))).toBe(401)
    await embedded.pg.query("update auth_accounts set status='active' where id=$1", [actors.operator.id])
  })
  it('creación/replay concurrente produce exactamente un evento con actor customer y fecha servidor', async () => {
    const key = randomUUID()
    const ids = await Promise.all([place(key), place(key), place(key)])
    expect(new Set(ids).size).toBe(1)
    const events = (await list({ entity: 'order', entityId: ids[0] })).items
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ action: 'created', actorKind: 'account', actorId: actors.customer.id, storeId: STORE, metadata: { version: 1, status: 'received', estimatedTotal: 31000 } })
    expect(Math.abs(Date.parse(events[0]!.createdAt) - Date.now())).toBeLessThan(30_000)
    expect(JSON.stringify(events)).not.toMatch(/NOMBRE PRIVADO|3001234567|573001234567|cookie|password|deliveryData|customerName/)
  })
  it('CAS concurrente: un ganador/un evento, actor de sesión; body by rechazado', async () => {
    const id = await place()
    const before = await count()
    expect(statusOf(await call('status', 'PATCH', actors.operator.cookie, { id }, { status: 'confirmed', expectedVersion: 1, by: actors.owner.id }))).toBe(400)
    const results = await Promise.all([call('status', 'PATCH', actors.operator.cookie, { id }, { status: 'confirmed', expectedVersion: 1 }), call('status', 'PATCH', actors.owner.cookie, { id }, { status: 'confirmed', expectedVersion: 1 })])
    expect(results.map(statusOf).sort()).toEqual([200, 409])
    expect(await count()).toBe(before + 1)
    const winner = statusOf(results[0]!) === 200 ? actors.operator : actors.owner
    expect((await list({ entityId: id, action: 'status_changed' })).items[0]).toMatchObject({ actorId: winner.id, metadata: { previousVersion: 1, version: 2, previousStatus: 'received', status: 'confirmed' } })
    expect(statusOf(await call('status', 'PATCH', actors.foreign.cookie, { id }, { status: 'preparing', expectedVersion: 2 }))).toBe(404)
    expect(await count()).toBe(before + 1)
  })
  it('pesos, sustitución, retiro y cancelación conservan datos útiles sin motivo libre', async () => {
    const id = await place()
    for (const [status, version] of [['confirmed', 1], ['preparing', 2]] as const) expect(statusOf(await call('status', 'PATCH', actors.operator.cookie, { id }, { status, expectedVersion: version }))).toBe(200)
    const product = (await repositories.catalog.findProduct(STORE, 'prod_leche'))!
    await repositories.catalog.createProduct({ ...product, id: 'substitute', name: 'Reemplazo' })
    const changes = [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.123 }, { type: 'substitute', itemId: 'prod_leche', productId: 'substitute', qty: 2 }]
    expect(statusOf(await call('items', 'PATCH', actors.operator.cookie, { id }, { expectedVersion: 3, changes }))).toBe(200)
    expect((await list({ entityId: id, action: 'items_changed' })).items[0]).toMatchObject({ actorId: actors.operator.id, metadata: { changes: [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.123 }, { type: 'substitute', itemId: 'prod_leche', productId: 'substitute' }] } })
    expect(statusOf(await call('items', 'PATCH', actors.operator.cookie, { id }, { expectedVersion: 4, changes: [{ type: 'remove', itemId: 'prod_carne' }] }))).toBe(200)
    expect((await list({ entityId: id, action: 'items_changed' })).items.some(event => event.metadata.changes?.[0]?.type === 'remove')).toBe(true)
    expect(statusOf(await call('status', 'PATCH', actors.owner.cookie, { id }, { expectedVersion: 5, status: 'cancelled', reason: 'MOTIVO PRIVADO DE CANCELACION' }))).toBe(200)
    expect(JSON.stringify((await list({ entityId: id })).items)).not.toContain('MOTIVO PRIVADO')
  })
  it('catálogo/category/delete y tienda auditados con actor real; historial sobrevive borrado', async () => {
    const created = await call('catalog', 'POST', actors.owner.cookie, { op: 'categories' }, { name: 'Categoría privada' })
    expect(statusOf(created), JSON.stringify(bodyOf(created))).toBe(201)
    const categoryId = (bodyOf(created) as { id: string }).id
    expect(statusOf(await call('catalog', 'PATCH', actors.owner.cookie, { op: 'category', id: categoryId }, { name: 'Editada' }))).toBe(200)
    expect(statusOf(await call('catalog', 'DELETE', actors.owner.cookie, { op: 'category', id: categoryId }))).toBe(204)
    const events = (await list({ entity: 'category', entityId: categoryId })).items
    expect(events.map(event => event.action).sort()).toEqual(['created', 'deleted', 'updated'])
    expect(events.every(event => event.actorId === actors.owner.id)).toBe(true)
    expect(await repositories.catalog.findCategory(STORE, categoryId)).toBeNull()
    const base = (await repositories.catalog.findProduct(STORE, 'prod_leche'))!
    const productCreated = await call('catalog', 'POST', actors.owner.cookie, { op: 'products' }, {
      name: 'Producto privado', categoryId: base.categoryId, price: 1200, imageUrl: '/fixture.png', is_variable_weight: false, unit: '1 L',
    })
    expect(statusOf(productCreated)).toBe(201)
    expect((await list({ entity: 'product', entityId: (bodyOf(productCreated) as { id: string }).id })).items[0]).toMatchObject({ actorId: actors.owner.id, action: 'created', metadata: { version: 1 } })
    expect(statusOf(await call('catalog', 'PATCH', actors.owner.cookie, { op: 'product', id: 'prod_leche' }, { inStock: false, archived: true, imageUrl: '/image-updated.webp' }))).toBe(200)
    expect((await list({ entity: 'product', entityId: 'prod_leche', action: 'updated' })).items[0]).toMatchObject({ actorId: actors.owner.id, metadata: { fields: ['imageUrl', 'inStock', 'archived'] } })
    expect(statusOf(await call('catalog', 'PATCH', actors.owner.cookie, { op: 'product', id: 'prod_leche' }, { inStock: true, archived: false }))).toBe(200)
    expect(statusOf(await call('store', 'PATCH', actors.owner.cookie, { op: 'staff' }, { address: 'DIRECCION PRIVADA', contactPhone: '3007654321', delivery: { shippingCost: 4000 } }))).toBe(200)
    const settingsEvents = (await list({ entity: 'store', action: 'updated' })).items
    expect(settingsEvents[0]).toMatchObject({ actorId: actors.owner.id, metadata: { fields: ['contactPhone', 'address', 'delivery'] } })
    expect(JSON.stringify(settingsEvents)).not.toMatch(/DIRECCION PRIVADA|3007654321/)
  })
  it('fallo de INSERT audit revierte creación/claim/cuota y mutaciones de todas las entidades', async () => {
    const id = await place(), product = (await repositories.catalog.findProduct(STORE, 'prod_leche'))!, store = (await repositories.store.findSettings(STORE))!
    const before = await count()
    const counts = async () => (await embedded.pg.query('select (select count(*)::int from orders) orders, (select count(*)::int from order_creations) claims, (select sum(attempts)::int from auth_rate_limits) quota')).rows[0]
    const prior = await counts(), key = randomUUID()
    await embedded.pg.exec("CREATE FUNCTION reject_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SQL SECRET 573001234567'; END $$; CREATE TRIGGER reject_audit_fixture BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_fixture();")
    try {
      const creation = await call('orders', 'POST', actors.customer.cookie, {}, { userId: actors.customer.id, customerName: 'Ana', customerPhone: '3001234567', deliveryType: 'pickup', deliveryData: {}, substitutionPreference: 'similar', items: [{ id: 'prod_leche', qty: 1 }] }, { 'idempotency-key': key })
      expect(statusOf(creation)).toBe(503)
      expect(await counts()).toEqual(prior)
      for (const response of [await call('status', 'PATCH', actors.operator.cookie, { id }, { expectedVersion: 1, status: 'confirmed' }), await call('catalog', 'PATCH', actors.owner.cookie, { op: 'product', id: product.id }, { price: product.price + 100 }), await call('store', 'PATCH', actors.owner.cookie, { op: 'staff' }, { name: 'No debe persistir' }), await call('catalog', 'POST', actors.owner.cookie, { op: 'categories' }, { name: 'No debe persistir' })]) {
        expect(statusOf(response), JSON.stringify(bodyOf(response))).toBe(503)
        expect(JSON.stringify(bodyOf(response))).not.toMatch(/SQL|SECRET|573001234567/)
      }
      expect((await repositories.orders.findById(id))!.version).toBe(1)
      expect(await repositories.catalog.findProduct(STORE, product.id)).toEqual(product)
      expect(await repositories.store.findSettings(STORE)).toEqual(store)
      expect(await count()).toBe(before)
    } finally { await embedded.pg.exec('DROP TRIGGER reject_audit_fixture ON audit_events; DROP FUNCTION reject_audit_fixture();') }
    expect(await place(key)).toBeDefined()
  })
  it('keyset conserva microsegundos/desempate; cursor ligado a filtros/actor/scope; límites estrictos', async () => {
    const ids = ['micro_a', 'micro_b', 'micro_c', 'micro_d']
    for (const [i, id] of ids.entries()) await embedded.pg.query("insert into audit_events(id,store_id,entity,entity_id,action,actor_kind,metadata,created_at) values($1,$2,'product','micro_target','updated','system','{}',$3::timestamptz)", [id, STORE, `2026-10-01T00:00:00.${i < 2 ? '000123' : '000124'}Z`])
    const query = { entityId: 'micro_target', limit: '1' }
    const seen: string[] = [], first = await list(query)
    seen.push(first.items[0]!.id)
    let page = first
    while (page.nextCursor) { page = await list({ ...query, cursor: page.nextCursor }); seen.push(...page.items.map(event => event.id)) }
    expect(seen).toEqual(['micro_d', 'micro_c', 'micro_b', 'micro_a'])
    expect(first.items[0]!.createdAt).toBe('2026-10-01T00:00:00.000124Z')
    for (const [actor, queryPatch] of [[actors.owner, { entityId: 'other' }], [actors.operator, {}], [actors.foreign, {}]] as const) expect(statusOf(await call('audit', 'GET', actor.cookie, { ...query, ...queryPatch, cursor: first.nextCursor }))).toBe(400)
    for (const invalid of [{ limit: '101' }, { limit: '1e1' }, { limit: '0' }, { entity: ['order', 'store'] }, { from: '2026-10-03', to: '2026-10-01' }, { arbitrary: 'SECRET' }]) expect(statusOf(await call('audit', 'GET', actors.owner.cookie, invalid))).toBe(400)
    expect((await list({ entityId: 'micro_target', from: '2026-10-01T00:00:00Z', to: '2026-10-01T00:00:01Z', limit: '100' })).items).toHaveLength(4)
    expect((await list({ entityId: 'micro_target', to: '2026-10-01T00:00:00Z' })).items).toHaveLength(0)
  })
})
