import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { CatalogCategory } from '../../src/domain/catalog/Catalog.js'
import { createCustomerAccount } from '../../src/usecases/auth/createCustomerAccount.js'
import { createStaffAccount } from '../../src/usecases/auth/createStaffAccount.js'
import { seedCatalogBaseline } from '../../src/usecases/catalog/seedCatalogBaseline.js'
import { createOrder } from '../../src/usecases/orders/createOrder.js'
import { initializeStore } from '../../src/usecases/store/initializeStore.js'
import { SEED_EPOCH, SEED_ORDERS, SEED_STORE, orderRequestFor, seedCustomerOf, seedOrderKey } from '../../src/usecases/seed/dataset.js'
import { SeedPreflightError, inspectSeed, type SeedConflictKind } from '../../src/usecases/seed/preflight.js'
import { runSeed } from '../../src/usecases/seed/runSeed.js'
import { dumpSeededState, startSeedWorld, testCredentials, type SeedWorld } from './seedFixture.js'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const clockAt = (iso: string) => ({ now: () => new Date(iso), nowIso: () => iso })
const FOREIGN_STORE = 'tienda-ajena'
const firstOrder = SEED_ORDERS[0]!

const baseCategory = (overrides: Partial<CatalogCategory>): CatalogCategory => ({
  id: 'cat-ajena', storeId: FOREIGN_STORE, name: 'Ajena', icon: null, slug: null, illustrationUrl: null, order: null,
  version: 1, createdAt: SEED_EPOCH, updatedAt: SEED_EPOCH, ...overrides,
})

/** Tienda y catálogo del dataset ya sembrados (sin cuentas ni pedidos), para armar colisiones finas. */
async function prepareStoreAndCatalog(world: SeedWorld): Promise<void> {
  const { repositories } = world.deps
  await initializeStore({ store: repositories.store, clock: clockAt(SEED_EPOCH) })
  await seedCatalogBaseline({ catalog: repositories.catalog, clock: clockAt(SEED_EPOCH) }, SEED_STORE)
}

async function prepareCustomer(world: SeedWorld, key: 'ana' | 'luis'): Promise<void> {
  const customer = seedCustomerOf(key)
  const { auth } = world.deps
  await createCustomerAccount({ ...auth, clock: clockAt(SEED_EPOCH), ids: { accountId: () => customer.id, sessionId: auth.ids.sessionId } },
    { name: customer.name, phone: customer.phone, password: testCredentials().customer })
}

const scenarios: { name: string; kind: SeedConflictKind; arrange(world: SeedWorld): Promise<void> }[] = [
  {
    name: 'un pedido ajeno usa el ID del dataset',
    kind: 'order_id_foreign',
    arrange: async world => {
      await world.embedded.pg.query(
        `insert into orders (id, store_id, customer_id, customer_name, customer_phone, items, total, status, delivery_mode,
           substitution_preference, created_at, updated_at) values ($1, 'otra', 'otro-cliente', 'Ajeno', '573000000099', '[]'::jsonb,
           1000, 'received', 'pickup', 'similar', now(), now())`, [firstOrder.id])
    },
  },
  {
    name: 'una categoría con el ID del dataset pertenece a otra tienda',
    kind: 'category_id_other_store',
    arrange: async world => {
      await initializeStore({ store: world.deps.repositories.store, clock: clockAt(SEED_EPOCH) }, { storeId: FOREIGN_STORE })
      await world.deps.repositories.catalog.insertCategoryIfAbsent(baseCategory({ id: 'cat-la' }))
    },
  },
  {
    name: 'un producto con el ID del dataset pertenece a otra tienda',
    kind: 'product_id_other_store',
    arrange: async world => {
      const { store, catalog } = world.deps.repositories
      await initializeStore({ store, clock: clockAt(SEED_EPOCH) }, { storeId: FOREIGN_STORE })
      await catalog.insertCategoryIfAbsent(baseCategory({}))
      await catalog.insertProductIfAbsent({
        id: 'arroz-1kg', storeId: FOREIGN_STORE, categoryId: 'cat-ajena', name: 'Arroz ajeno', displayName: null, legalName: null,
        price: 1000, originalPrice: null, unit: '1 kg', imageUrl: '/x.png', inStock: true, isVariableWeight: false, badge: null,
        currency: 'COP', description: null, nutritionalInfo: null, availability: null, active: true, archivedAt: null,
        version: 1, createdAt: SEED_EPOCH, updatedAt: SEED_EPOCH,
      })
    },
  },
  {
    name: 'otra categoría de la tienda ocupa el slug del dataset',
    kind: 'category_slug_taken',
    arrange: async world => {
      await initializeStore({ store: world.deps.repositories.store, clock: clockAt(SEED_EPOCH) })
      await world.deps.repositories.catalog.insertCategoryIfAbsent(baseCategory({ id: 'cat-otra', storeId: SEED_STORE, slug: 'lacteos' }))
    },
  },
  {
    name: 'el email del propietario pertenece a otra cuenta',
    kind: 'account_identity_taken',
    arrange: async world => {
      await createStaffAccount({ ...world.deps.auth, clock: clockAt(SEED_EPOCH) },
        { role: 'owner', name: 'Otro dueño', email: 'propietario@seed.maui.invalid', storeId: SEED_STORE, password: testCredentials().owner })
    },
  },
  {
    name: 'el teléfono de un cliente pertenece a otra cuenta',
    kind: 'account_identity_taken',
    arrange: async world => {
      await createCustomerAccount({ ...world.deps.auth, clock: clockAt(SEED_EPOCH) },
        { name: 'Otra persona', phone: '3000000001', password: testCredentials().customer })
    },
  },
  {
    name: 'la cuenta con el ID del propietario tiene otro rol y otra identidad',
    kind: 'account_mismatch',
    arrange: async world => {
      const { auth } = world.deps
      await createStaffAccount({ ...auth, clock: clockAt(SEED_EPOCH), ids: { accountId: () => 'acc_seed_owner', sessionId: auth.ids.sessionId } },
        { role: 'operator', name: 'Impostor', email: 'otro@seed.maui.invalid', storeId: SEED_STORE, password: testCredentials().operator })
    },
  },
  {
    name: 'la clave de idempotencia del seed ya creó otro pedido',
    kind: 'order_claim_mismatch',
    arrange: async world => {
      await prepareStoreAndCatalog(world)
      await prepareCustomer(world, firstOrder.customer)
      const customer = seedCustomerOf(firstOrder.customer)
      const { repositories, auth } = world.deps
      await createOrder({ ...repositories, keys: auth.keys, clock: clockAt(firstOrder.createdAt), newOrderId: () => 'otro-pedido' },
        { id: customer.id, role: 'customer', storeId: null }, orderRequestFor(firstOrder, customer.id), { storeId: SEED_STORE }, seedOrderKey(firstOrder))
    },
  },
  {
    name: 'el pedido sembrado antes tiene otra huella que el dataset vigente',
    kind: 'order_fingerprint_changed',
    arrange: async world => {
      await prepareStoreAndCatalog(world)
      await prepareCustomer(world, firstOrder.customer)
      const customer = seedCustomerOf(firstOrder.customer)
      const { repositories, auth } = world.deps
      const changed = { ...orderRequestFor(firstOrder, customer.id), items: [{ id: 'arroz-1kg', qty: 7 }] }
      await createOrder({ ...repositories, keys: auth.keys, clock: clockAt(firstOrder.createdAt), newOrderId: () => firstOrder.id },
        { id: customer.id, role: 'customer', storeId: null }, changed, { storeId: SEED_STORE }, seedOrderKey(firstOrder))
    },
  },
  {
    name: 'las migraciones no están aplicadas (falta una tabla)',
    kind: 'schema_missing',
    arrange: async world => { await world.embedded.pg.exec('drop table order_creations cascade') },
  },
]

describe('preflight del seed: colisiones y esquema abortan sin escribir nada', () => {
  it.each(scenarios)('$name → $kind', async ({ kind, arrange }) => {
    const world = await startSeedWorld()
    try {
      await arrange(world)
      const before = await world.embedded.pg.query('select ' +
        "(select count(*) from stores) s, (select count(*) from catalog_categories) c, (select count(*) from catalog_products) p, " +
        '(select count(*) from auth_accounts) a, (select count(*) from orders) o, (select count(*) from audit_events) e')
      const snapshot = kind === 'schema_missing' ? undefined : await dumpSeededState(world)

      const error = await runSeed(world.deps, testCredentials()).then(() => null, (thrown: unknown) => thrown)
      expect(error).toBeInstanceOf(SeedPreflightError)
      expect((error as SeedPreflightError).conflicts.map(conflict => conflict.kind)).toContain(kind)
      expect((error as SeedPreflightError).code).toBe('SEED_PREFLIGHT_REJECTED')

      const after = await world.embedded.pg.query('select ' +
        "(select count(*) from stores) s, (select count(*) from catalog_categories) c, (select count(*) from catalog_products) p, " +
        '(select count(*) from auth_accounts) a, (select count(*) from orders) o, (select count(*) from audit_events) e')
      expect(after.rows).toEqual(before.rows)
      if (snapshot) expect(await dumpSeededState(world)).toEqual(snapshot)
    } finally {
      await world.close()
    }
  })

  it('el conflicto no refleja datos de la fila ajena', async () => {
    const world = await startSeedWorld()
    try {
      await createStaffAccount({ ...world.deps.auth, clock: clockAt(SEED_EPOCH) },
        { role: 'owner', name: 'Nombre privado ajeno', email: 'propietario@seed.maui.invalid', storeId: SEED_STORE, password: testCredentials().owner })
      const preflight = await inspectSeed(world.deps.inspector)
      expect(JSON.stringify(preflight.conflicts)).not.toContain('Nombre privado ajeno')
    } finally {
      await world.close()
    }
  })
})

describe('resultado reproducible', () => {
  it('dos bases limpias sembradas por separado quedan idénticas (sin hashes ni IDs/fechas de audit)', async () => {
    // El transporte embebido es global (neonConfig): las bases se siembran de una en una.
    const seeded: { dump: Record<string, unknown[]>; contentHash: string }[] = []
    for (let run = 0; run < 2; run += 1) {
      const world = await startSeedWorld()
      try {
        const { preflight } = await runSeed(world.deps, testCredentials())
        seeded.push({ dump: await dumpSeededState(world), contentHash: preflight.contentHash })
      } finally {
        await world.close()
      }
    }
    expect(seeded[0]?.dump.orders).toHaveLength(SEED_ORDERS.length)
    expect(seeded[1]?.dump).toEqual(seeded[0]?.dump)
    expect(seeded[1]?.contentHash).toBe(seeded[0]?.contentHash)
    expect(seeded[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('el SQL embebido aplica todas las migraciones del journal y el preflight lo acepta', async () => {
    const world = await startSeedWorld()
    try {
      const journal = JSON.parse(readFileSync(new URL('../../src/infra/postgres/migrations/meta/_journal.json', import.meta.url), 'utf8')) as { entries: unknown[] }
      expect(journal.entries).toHaveLength(8)
      expect(await world.deps.inspector.schemaStatus()).toEqual({ missing: [], ledgerEntries: null })
      const preflight = await inspectSeed(world.deps.inspector)
      expect(preflight.conflicts).toEqual([])
      expect(preflight.plan.ordersToCreate).toHaveLength(SEED_ORDERS.length)
    } finally {
      await world.close()
    }
  })
})
