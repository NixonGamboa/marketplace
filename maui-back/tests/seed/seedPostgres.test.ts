import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sharedCategories, sharedProducts } from '../../../shared/catalog/index.js'
import { createCustomerAccount } from '../../src/usecases/auth/createCustomerAccount.js'
import { seedCatalogBaseline } from '../../src/usecases/catalog/seedCatalogBaseline.js'
import { createOrder } from '../../src/usecases/orders/createOrder.js'
import { updateOrderStatus } from '../../src/usecases/orders/updateOrderStatus.js'
import { initializeStore } from '../../src/usecases/store/initializeStore.js'
import {
  SEED_CUSTOMERS, SEED_EPOCH, SEED_ORDERS, SEED_STAFF, SEED_STORE, finalStatusOf, orderRequestFor, seedCustomerOf, seedOrderKey,
} from '../../src/usecases/seed/dataset.js'
import { SeedCredentialsError, runSeed, type SeedReport } from '../../src/usecases/seed/runSeed.js'
import { countRows, dumpSeededState, startSeedWorld, testCredentials, type SeedWorld } from './seedFixture.js'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const clockAt = (iso: string) => ({ now: () => new Date(iso), nowIso: () => iso })

const orderRow = async (world: SeedWorld, id: string) =>
  (await world.embedded.pg.query<Record<string, unknown>>(
    `select status, total, shipping_cost, final_total, version, updated_by, delivery_mode, items, original_items,
            item_adjustments, cancellation_reason from orders where id = $1`, [id])).rows[0]

describe('seed de servidor sobre PostgreSQL embebido (todas las migraciones)', () => {
  let world: SeedWorld
  let first: SeedReport
  const credentials = testCredentials()

  beforeAll(async () => {
    world = await startSeedWorld()
    first = (await runSeed(world.deps, credentials)).report
  })
  afterAll(async () => { await world.close() })

  it('siembra tienda, catálogo, cuentas y pedidos del dataset versionado', async () => {
    expect(first.datasetVersion).toBe('test-seed-v1')
    expect(first.store).toBe('created')
    expect(first.catalog).toEqual({
      categoriesInserted: sharedCategories.length, categoriesSkipped: 0,
      productsInserted: sharedProducts.length, productsSkipped: 0,
    })
    expect(first.accounts.map(account => account.outcome)).toEqual(Array(SEED_STAFF.length + SEED_CUSTOMERS.length).fill('created'))
    expect(first.orders.map(order => [order.id, order.outcome, order.status])).toEqual(
      SEED_ORDERS.map(spec => [spec.id, 'created', finalStatusOf(spec)]))
    expect(await countRows(world, 'stores')).toBe(1)
    expect(await countRows(world, 'catalog_products')).toBe(sharedProducts.length)
    expect(await countRows(world, 'orders')).toBe(SEED_ORDERS.length)
    expect(await countRows(world, 'order_creations')).toBe(SEED_ORDERS.length)
  })

  it('cubre los siete estados, recogida/domicilio y peso fijo/variable', async () => {
    const statuses = new Set(first.orders.map(order => order.status))
    expect([...statuses].sort()).toEqual(['cancelled', 'confirmed', 'delivered', 'in_delivery', 'preparing', 'ready', 'received'])
    const modes = (await world.embedded.pg.query<{ delivery_mode: string }>('select distinct delivery_mode from orders')).rows.map(row => row.delivery_mode)
    expect(modes.sort()).toEqual(['delivery', 'pickup'])
    const variable = await world.embedded.pg.query(`select id from orders where items @> '[{"is_variable_weight": true}]'::jsonb`)
    expect(variable.rows.length).toBeGreaterThanOrEqual(4)
    const fixedOnly = await world.embedded.pg.query(`select id from orders where not (items @> '[{"is_variable_weight": true}]'::jsonb)`)
    expect(fixedOnly.rows.length).toBeGreaterThanOrEqual(3)
  })

  it.each([
    ['ord-seed-recibido-recogida', 14500, 0, null],
    ['ord-seed-confirmado-domicilio', 23400, 3000, null],
    ['ord-seed-preparando-peso-variable', 22450, 3000, null],
    ['ord-seed-listo-recogida-sustitucion', 19850, 0, 17500],
    ['ord-seed-en-camino-domicilio', 23600, 3000, 23975],
    ['ord-seed-entregado-domicilio-gratis', 35000, 0, 35000],
    ['ord-seed-entregado-recogida-peso', 24000, 0, 23850],
    ['ord-seed-cancelado-recibido', 18600, 3000, null],
    ['ord-seed-cancelado-confirmado', 1_350_000, 0, null],
  ])('%s: estimado %d, envío %d, final %s con precios del catálogo vigente', async (id, total, shipping, finalTotal) => {
    expect(await orderRow(world, id)).toMatchObject({ total, shipping_cost: shipping, final_total: finalTotal })
  })

  it('conserva sustitución, pesos reales y motivo de cancelación como constancia', async () => {
    const substituted = await orderRow(world, 'ord-seed-listo-recogida-sustitucion')
    expect(substituted?.original_items).toBeTruthy()
    expect(substituted?.item_adjustments).toMatchObject([
      { type: 'substitute', itemId: 'gaseosa-cola-2l', productId: 'agua-botella-600ml', customerContacted: true, by: 'acc_seed_operator' },
    ])
    expect(await orderRow(world, 'ord-seed-cancelado-recibido')).toMatchObject({
      status: 'cancelled', cancellation_reason: 'El cliente pidió cancelar antes de la confirmación', updated_by: 'acc_seed_owner',
    })
  })

  it('el producto agotado del catálogo existe y no es pedible', async () => {
    const out = await world.embedded.pg.query<{ in_stock: boolean }>(`select in_stock from catalog_products where id = 'jabon-bano-3pack'`)
    expect(out.rows[0]?.in_stock).toBe(false)
    const referenced = await world.embedded.pg.query(`select id from orders where items @> '[{"id": "jabon-bano-3pack"}]'::jsonb`)
    expect(referenced.rows).toHaveLength(0)
  })

  it('el contacto del negocio queda en null y la cobertura urbana viene de storeSeed', async () => {
    const { rows } = await world.embedded.pg.query<{ contact_phone: string | null; coverage_note: string }>(
      'select contact_phone, coverage_note from stores where id = $1', [SEED_STORE])
    expect(rows[0]).toEqual({ contact_phone: null, coverage_note: 'Solo hay cobertura en el casco urbano de Dolores' })
  })

  it('audit: sistema para tienda/catálogo, cliente al crear y cuentas del servidor al mutar', async () => {
    const { rows } = await world.embedded.pg.query<{ entity: string; action: string; actor_kind: string; actor_id: string | null }>(
      'select distinct entity, action, actor_kind, actor_id from audit_events order by 1, 2, 3, 4')
    const system = rows.filter(row => row.actor_kind === 'system')
    expect(system.every(row => row.action === 'created' && row.actor_id === null)).toBe(true)
    expect(system.map(row => row.entity).sort()).toEqual(['category', 'product', 'store'])
    const orders = rows.filter(row => row.entity === 'order')
    expect(orders.every(row => row.actor_kind === 'account')).toBe(true)
    expect(orders.filter(row => row.action === 'created').map(row => row.actor_id).sort()).toEqual(['acc_seed_customer_ana', 'acc_seed_customer_luis'])
    expect(new Set(orders.filter(row => row.action !== 'created').map(row => row.actor_id))).toEqual(new Set(['acc_seed_operator', 'acc_seed_owner']))
    expect(orders.some(row => row.action === 'status_changed')).toBe(true)
    expect(orders.some(row => row.action === 'items_changed')).toBe(true)
  })

  it('la segunda ejecución no duplica ni sobrescribe nada, ni siquiera sin credenciales', async () => {
    const before = await dumpSeededState(world)
    const auditBefore = await countRows(world, 'audit_events')
    const second = (await runSeed(world.deps)).report
    expect(second.store).toBe('present')
    expect(second.catalog).toEqual({
      categoriesInserted: 0, categoriesSkipped: sharedCategories.length,
      productsInserted: 0, productsSkipped: sharedProducts.length,
    })
    expect(second.accounts.every(account => account.outcome === 'verified')).toBe(true)
    expect(second.orders.every(order => order.outcome === 'unchanged')).toBe(true)
    expect(await dumpSeededState(world)).toEqual(before)
    expect(await countRows(world, 'audit_events')).toBe(auditBefore)
  })

  it('una cuenta existente se verifica sin resetear su contraseña ni elevar permisos', async () => {
    const read = async () => (await world.embedded.pg.query<{ password_hash: string; role: string }>(
      `select password_hash, role from auth_accounts where id = 'acc_seed_owner'`)).rows[0]
    const stored = await read()
    await runSeed(world.deps, { owner: 'otra-clave-distinta-123', operator: 'otra-clave-distinta-456', customer: 'otra-clave-distinta-789' })
    const after = await read()
    expect(after).toEqual(stored)
    expect(await world.hasher.verify(credentials.owner, after?.password_hash ?? '')).toBe(true)
  })
})

describe('edición, reanudación y credenciales', () => {
  it('no sobrescribe ediciones de catálogo, tienda ni pedidos al resembrar', async () => {
    const world = await startSeedWorld()
    try {
      await runSeed(world.deps, testCredentials())
      const { catalog, store, orders } = world.deps.repositories

      const product = await catalog.findProduct(SEED_STORE, 'arroz-1kg')
      await catalog.updateProduct({ ...product!, price: 6100, version: product!.version + 1 }, product!.version)
      const settings = await store.findSettings(SEED_STORE)
      await store.updateSettings({ ...settings!, name: 'Nombre editado', version: settings!.version + 1 }, settings!.version)
      const received = await orders.findById('ord-seed-recibido-recogida')
      const operator = { id: 'acc_seed_operator', role: 'operator' as const, storeId: SEED_STORE }
      await updateOrderStatus({ orders, clock: clockAt(new Date().toISOString()) }, operator,
        'ord-seed-recibido-recogida', { status: 'confirmed', expectedVersion: received!.version })

      const again = (await runSeed(world.deps)).report
      expect((await catalog.findProduct(SEED_STORE, 'arroz-1kg'))?.price).toBe(6100)
      expect((await store.findSettings(SEED_STORE))?.name).toBe('Nombre editado')
      expect((await orders.findById('ord-seed-recibido-recogida'))?.status).toBe('confirmed')
      expect(again.orders.find(order => order.id === 'ord-seed-recibido-recogida')?.outcome).toBe('preserved')
    } finally {
      await world.close()
    }
  })

  it('un pedido creado pero sin avanzar se reanuda hasta el final del guion', async () => {
    const world = await startSeedWorld()
    try {
      const credentials = testCredentials()
      const { repositories, auth } = world.deps
      await initializeStore({ store: repositories.store, clock: clockAt(SEED_EPOCH) })
      await seedCatalogBaseline({ catalog: repositories.catalog, clock: clockAt(SEED_EPOCH) }, SEED_STORE)
      const spec = SEED_ORDERS.find(candidate => candidate.id === 'ord-seed-en-camino-domicilio')!
      const customer = seedCustomerOf(spec.customer)
      await createCustomerAccount(
        { ...auth, clock: clockAt(SEED_EPOCH), ids: { accountId: () => customer.id, sessionId: auth.ids.sessionId } },
        { name: customer.name, phone: customer.phone, password: credentials.customer })
      await createOrder({ ...repositories, keys: auth.keys, clock: clockAt(spec.createdAt), newOrderId: () => spec.id },
        { id: customer.id, role: 'customer', storeId: null }, orderRequestFor(spec, customer.id), { storeId: SEED_STORE }, seedOrderKey(spec))

      const { report } = await runSeed(world.deps, credentials)
      expect(report.accounts.find(account => account.id === customer.id)?.outcome).toBe('verified')
      expect(report.orders.find(order => order.id === spec.id)).toMatchObject({ outcome: 'advanced', status: 'in_delivery' })
    } finally {
      await world.close()
    }
  })

  it('sin credenciales para las cuentas por crear aborta antes de escribir', async () => {
    const world = await startSeedWorld()
    try {
      await expect(runSeed(world.deps, { owner: 'solo-el-propietario-1' })).rejects.toBeInstanceOf(SeedCredentialsError)
      for (const table of ['stores', 'catalog_products', 'auth_accounts', 'orders', 'audit_events']) expect(await countRows(world, table)).toBe(0)
    } finally {
      await world.close()
    }
  })
})
