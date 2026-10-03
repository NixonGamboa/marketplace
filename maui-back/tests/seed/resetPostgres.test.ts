import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { initializeStore } from '../../src/usecases/store/initializeStore.js'
import { SEED_CUSTOMERS, SEED_EPOCH, SEED_ORDERS, SEED_STORE } from '../../src/usecases/seed/dataset.js'
import { ResetRejectedError, runReset, type ResetResult } from '../../src/usecases/seed/resetFixtures.js'
import { EnvironmentGuardError } from '../../src/usecases/seed/resetGuard.js'
import { runSeed } from '../../src/usecases/seed/runSeed.js'
import { countRows, dumpSeededState, startSeedWorld, testCredentials, type SeedWorld } from './seedFixture.js'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

/** PGlite informa `postgres`; el destino de la prueba se declara con ese nombre. */
const TARGET = { host: 'ep-dev-fixture.example.neon.tech', database: 'postgres' }
const resetDeps = (world: SeedWorld) => ({ inspector: world.store, eraser: world.store, keys: world.keys, target: TARGET })

const LEGACY_ORDER = 'legacy-order-1'

/** Mundo sembrado + filas ajenas que el reset nunca debe tocar. */
async function seededWorldWithBystanders(): Promise<SeedWorld> {
  const world = await startSeedWorld()
  await runSeed(world.deps, testCredentials())
  const { pg } = world.embedded
  await pg.query(
    `insert into orders (id, store_id, customer_id, customer_name, customer_phone, items, total, status, delivery_mode,
       substitution_preference, created_at, updated_at) values ($1, $2, 'cliente-legacy', 'Legacy', '573000000077', '[]'::jsonb,
       5000, 'delivered', 'pickup', 'similar', '2026-05-01T10:00:00Z', '2026-05-01T10:00:00Z')`, [LEGACY_ORDER, SEED_STORE])
  const { store, catalog } = world.deps.repositories
  await initializeStore({ store, clock: { now: () => new Date(SEED_EPOCH), nowIso: () => SEED_EPOCH } }, { storeId: 'tienda-ajena' })
  await catalog.insertCategoryIfAbsent({
    id: 'cat-ajena', storeId: 'tienda-ajena', name: 'Ajena', icon: null, slug: 'ajena', illustrationUrl: null, order: null,
    version: 1, createdAt: SEED_EPOCH, updatedAt: SEED_EPOCH,
  })
  return world
}

const digest = (rows: unknown[]): string => createHash('md5').update(JSON.stringify(rows)).digest('hex')
const bystanderDigest = async (world: SeedWorld): Promise<string> => digest([
  (await world.embedded.pg.query('select * from orders where id = $1', [LEGACY_ORDER])).rows,
  (await world.embedded.pg.query(`select * from stores where id = 'tienda-ajena'`)).rows,
  (await world.embedded.pg.query(`select * from catalog_categories where store_id = 'tienda-ajena'`)).rows,
  (await world.embedded.pg.query(`select entity, entity_id, action, actor_kind, metadata from audit_events where store_id = 'tienda-ajena' order by id`)).rows,
])

const rejection = async (promise: Promise<unknown>): Promise<unknown> => promise.then(() => null, (error: unknown) => error)

describe('reset de fixtures sobre PostgreSQL embebido', () => {
  it('el dry-run mide sin borrar y devuelve un token estable ligado al destino y al estado', async () => {
    const world = await seededWorldWithBystanders()
    try {
      const before = await dumpSeededState(world)
      const result = await runReset(resetDeps(world))
      expect(result.mode).toBe('dry-run')
      expect(result.target).toEqual(TARGET)
      expect(result.datasetVersion).toBe('test-seed-v1')
      expect(result.measure.blockers).toEqual([])
      expect(result.measure.toDelete).toMatchObject({
        orders: SEED_ORDERS.length, orderClaims: SEED_ORDERS.length, accounts: 4, products: 16, categories: 9, store: 0, rateLimits: 2,
      })
      expect(result.measure.toDelete.auditEvents).toBeGreaterThan(SEED_ORDERS.length)
      expect(result.confirmationToken).toMatch(/^reset-[0-9a-f]{24}$/)
      expect((await runReset(resetDeps(world))).confirmationToken).toBe(result.confirmationToken)
      expect(await dumpSeededState(world)).toEqual(before)
      expect((await runReset({ ...resetDeps(world), target: { ...TARGET, host: 'otro.example' } })).confirmationToken).not.toBe(result.confirmationToken)
      expect((await runReset(resetDeps(world), { includeStore: true })).confirmationToken).not.toBe(result.confirmationToken)
    } finally {
      await world.close()
    }
  })

  it('ejecutar exige la confirmación del dry-run y un token ajeno no borra nada', async () => {
    const world = await seededWorldWithBystanders()
    try {
      const before = await dumpSeededState(world)
      const missing = await rejection(runReset(resetDeps(world), { execute: true }))
      expect(missing).toMatchObject({ code: 'RESET_REJECTED', reason: 'CONFIRMATION_REQUIRED' })
      const wrong = await rejection(runReset(resetDeps(world), { execute: true, confirm: 'reset-000000000000000000000000' }))
      expect(wrong).toMatchObject({ reason: 'CONFIRMATION_MISMATCH' })
      expect(await dumpSeededState(world)).toEqual(before)
    } finally {
      await world.close()
    }
  })

  it('borra solo los fixtures: conserva pedido legacy, otra tienda, configuración de la tienda y migraciones', async () => {
    const world = await seededWorldWithBystanders()
    try {
      const bystanders = await bystanderDigest(world)
      const storeRow = (await world.embedded.pg.query('select * from stores where id = $1', [SEED_STORE])).rows
      const dry = await runReset(resetDeps(world))
      const executed = await runReset(resetDeps(world), { execute: true, confirm: dry.confirmationToken })

      expect(executed.mode).toBe('executed')
      expect(executed.remaining?.toDelete).toEqual({
        auditEvents: 0, orders: 0, orderClaims: 0, sessions: 0, accounts: 0, rateLimits: 0, products: 0, categories: 0, store: 0,
      })
      for (const table of ['orders', 'order_creations', 'auth_accounts', 'catalog_products']) {
        expect(await countRows(world, table)).toBe(table === 'orders' ? 1 : 0)
      }
      expect(await countRows(world, 'catalog_categories')).toBe(1)
      expect(await bystanderDigest(world)).toBe(bystanders)
      expect((await world.embedded.pg.query('select * from stores where id = $1', [SEED_STORE])).rows).toEqual(storeRow)
      expect(await world.store.schemaStatus()).toEqual({ missing: [], ledgerEntries: null })
    } finally {
      await world.close()
    }
  })

  it('borra sesiones de las cuentas de test y sus cuotas, y deja los pedidos propios de esos clientes', async () => {
    const world = await seededWorldWithBystanders()
    try {
      const [ana] = SEED_CUSTOMERS
      await world.embedded.pg.query(
        `insert into auth_sessions (id, account_id, created_at, expires_at) values ('ses_fixture', $1, now(), now() + interval '1 day')`, [ana?.id])
      await world.embedded.pg.query(
        `insert into orders (id, store_id, customer_id, customer_name, customer_phone, items, total, status, delivery_mode,
           substitution_preference, created_at, updated_at) values ('pedido-manual-de-ana', $1, $2, 'Ana', '573000000001', '[]'::jsonb,
           1000, 'received', 'pickup', 'similar', now(), now())`, [SEED_STORE, ana?.id])
      const dry = await runReset(resetDeps(world))
      expect(dry.measure.toDelete.sessions).toBe(1)
      expect(dry.measure.retainedCustomerOrders).toBe(1)
      await runReset(resetDeps(world), { execute: true, confirm: dry.confirmationToken })
      expect(await countRows(world, 'auth_sessions')).toBe(0)
      expect(await countRows(world, 'auth_rate_limits')).toBe(0)
      expect((await world.embedded.pg.query(`select id from orders where id = 'pedido-manual-de-ana'`)).rows).toHaveLength(1)
    } finally {
      await world.close()
    }
  })

  it('un cambio entre el dry-run y la ejecución invalida el token', async () => {
    const world = await seededWorldWithBystanders()
    try {
      const dry = await runReset(resetDeps(world))
      const product = await world.deps.repositories.catalog.findProduct(SEED_STORE, 'arroz-1kg')
      await world.deps.repositories.catalog.updateProduct({ ...product!, price: 6100, version: product!.version + 1 }, product!.version)
      const error = await rejection(runReset(resetDeps(world), { execute: true, confirm: dry.confirmationToken }))
      expect(error).toMatchObject({ reason: 'CONFIRMATION_MISMATCH' })
      expect(await countRows(world, 'orders')).toBe(SEED_ORDERS.length + 1)
    } finally {
      await world.close()
    }
  })

  it.each([
    ['un pedido ajeno con el ID de un fixture', 'foreign_order_with_fixture_id', async (world: SeedWorld) => {
      await world.embedded.pg.query('delete from orders where id = $1', [SEED_ORDERS[0]?.id])
      await world.embedded.pg.query(
        `insert into orders (id, store_id, customer_id, customer_name, customer_phone, items, total, status, delivery_mode,
           substitution_preference, created_at, updated_at) values ($1, $2, 'otro', 'Ajeno', '573000000088', '[]'::jsonb,
           1000, 'received', 'pickup', 'similar', now(), now())`, [SEED_ORDERS[0]?.id, SEED_STORE])
    }],
    ['una cuenta ajena con el ID de un fixture', 'foreign_account_with_fixture_id', async (world: SeedWorld) => {
      await world.embedded.pg.query(`update auth_accounts set role = 'operator' where id = 'acc_seed_owner'`)
    }],
    ['un producto propio dentro de una categoría de fixture', 'foreign_product_in_fixture_category', async (world: SeedWorld) => {
      const { catalog } = world.deps.repositories
      const base = await catalog.findProduct(SEED_STORE, 'arroz-1kg')
      await catalog.createProduct({ ...base!, id: 'producto-del-negocio', name: 'Nuevo del negocio' })
    }],
    ['un producto de otra tienda con el ID de un fixture', 'foreign_product_with_fixture_id', async (world: SeedWorld) => {
      // La FK compuesta exige una categoría de esa misma tienda.
      await world.embedded.pg.query(`update catalog_products set category_id = 'cat-ajena', store_id = 'tienda-ajena' where id = 'azucar-1kg'`)
    }],
  ])('%s bloquea el reset: se informa en el dry-run y no se borra nada', async (_name, blocker, arrange) => {
    const world = await seededWorldWithBystanders()
    try {
      await arrange(world)
      const before = await dumpSeededState(world)
      const dry = await runReset(resetDeps(world))
      expect(dry.measure.blockers.map(item => item.kind)).toContain(blocker)
      const error = await rejection(runReset(resetDeps(world), { execute: true, confirm: dry.confirmationToken }))
      expect(error).toMatchObject({ code: 'RESET_REJECTED', reason: 'BLOCKERS' })
      expect(await dumpSeededState(world)).toEqual(before)
    } finally {
      await world.close()
    }
  })

  it('con includeStore borra también la tienda y su historial, salvo que haya dependientes ajenos', async () => {
    const world = await seededWorldWithBystanders()
    try {
      const dry = await runReset(resetDeps(world), { includeStore: true })
      expect(dry.measure.toDelete.store).toBe(1)
      await runReset(resetDeps(world), { includeStore: true, execute: true, confirm: dry.confirmationToken })
      expect((await world.embedded.pg.query('select id from stores order by id')).rows).toEqual([{ id: 'tienda-ajena' }])
      expect((await world.embedded.pg.query(`select id from audit_events where store_id = $1`, [SEED_STORE])).rows).toEqual([])
      expect((await world.embedded.pg.query('select id from orders')).rows).toEqual([{ id: LEGACY_ORDER }])
    } finally {
      await world.close()
    }
  })

  it('includeStore con cuentas de la tienda que no son fixtures se rechaza', async () => {
    const world = await seededWorldWithBystanders()
    try {
      await world.embedded.pg.query(
        `insert into auth_accounts (id, role, name, email, store_id, password_hash, status, created_at, updated_at)
         values ('acc_otro_operario', 'operator', 'Otro', 'otro@tienda.example.com', $1, 'hash', 'active', now(), now())`, [SEED_STORE])
      const dry = await runReset(resetDeps(world), { includeStore: true })
      expect(dry.measure.blockers).toEqual([{ kind: 'store_has_foreign_dependents', count: 1 }])
      expect(await rejection(runReset(resetDeps(world), { includeStore: true, execute: true, confirm: dry.confirmationToken })))
        .toMatchObject({ reason: 'BLOCKERS' })
    } finally {
      await world.close()
    }
  })

  it('reset + seed restauran el mismo estado sembrado y no tocan lo ajeno', async () => {
    const world = await seededWorldWithBystanders()
    try {
      const bystanders = await bystanderDigest(world)
      const seeded = await dumpSeededState(world)
      const dry = await runReset(resetDeps(world))
      await runReset(resetDeps(world), { execute: true, confirm: dry.confirmationToken })
      await runSeed(world.deps, testCredentials())
      const restored = await dumpSeededState(world)
      // Lo ajeno (pedido legacy y otra tienda) se compara aparte; aquí solo lo sembrado.
      const seededOnly = (state: Record<string, unknown[]>): Record<string, unknown[]> => ({
        ...state,
        orders: (state.orders ?? []).filter(row => (row as { id: string }).id !== LEGACY_ORDER),
        audit: (state.audit ?? []).filter(row => (row as { store_id: string }).store_id === SEED_STORE),
      })
      expect(seededOnly(restored)).toEqual(seededOnly(seeded))
      expect(await bystanderDigest(world)).toBe(bystanders)
    } finally {
      await world.close()
    }
  })

  it('rechaza con esquema ausente y con una base distinta de la declarada, sin borrar', async () => {
    const world = await seededWorldWithBystanders()
    try {
      const wrongDatabase = await rejection(runReset({ ...resetDeps(world), target: { ...TARGET, database: 'maui' } }, { execute: true, confirm: 'reset-x' }))
      expect(wrongDatabase).toBeInstanceOf(EnvironmentGuardError)
      expect(wrongDatabase).toMatchObject({ reason: 'DATABASE_IDENTITY_MISMATCH' })
      await world.embedded.pg.exec('drop table order_creations cascade')
      const missing = await rejection(runReset(resetDeps(world)))
      expect(missing).toBeInstanceOf(ResetRejectedError)
      expect(missing).toMatchObject({ reason: 'SCHEMA_MISSING' })
      expect(await countRows(world, 'orders')).toBe(SEED_ORDERS.length + 1)
    } finally {
      await world.close()
    }
  })

  it('el resultado no contiene contraseñas, hashes ni cadenas de conexión', async () => {
    const world = await seededWorldWithBystanders()
    try {
      const hashes = (await world.embedded.pg.query<{ password_hash: string }>('select password_hash from auth_accounts')).rows
      const result: ResetResult = await runReset(resetDeps(world))
      const text = JSON.stringify(result)
      for (const { password_hash } of hashes) expect(text).not.toContain(password_hash)
      expect(text).not.toMatch(/password|postgres(ql)?:\/\//i)
    } finally {
      await world.close()
    }
  })
})
