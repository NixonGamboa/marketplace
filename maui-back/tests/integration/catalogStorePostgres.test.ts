import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CatalogProduct } from '../../src/domain/catalog/Catalog.js'
import { UnknownCategoryError } from '../../src/domain/catalog/errors.js'
import type { StoreActor } from '../../src/domain/store/storeAccess.js'
import { CatalogRepositoryPostgres } from '../../src/infra/postgres/CatalogRepositoryPostgres.js'
import { StoreRepositoryPostgres } from '../../src/infra/postgres/StoreRepositoryPostgres.js'
import { ValidationError } from '../../src/shared/errors.js'
import { createCategory, deleteCategory } from '../../src/usecases/catalog/manageCategories.js'
import { createProduct, updateProduct } from '../../src/usecases/catalog/manageProducts.js'
import { getPublicCatalog, getStaffCatalog } from '../../src/usecases/catalog/readCatalog.js'
import { seedCatalogBaseline } from '../../src/usecases/catalog/seedCatalogBaseline.js'
import { initializeStore } from '../../src/usecases/store/initializeStore.js'
import { updateStoreSettings } from '../../src/usecases/store/updateStoreSettings.js'
import { TestClock } from '../auth/fixtures.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

const STORE = 'leche-y-miel'
const OTHER = 'otra-tienda'
const owner: StoreActor = { id: 'acc_owner', role: 'owner', storeId: STORE }
const foreignOwner: StoreActor = { id: 'acc_foreign', role: 'owner', storeId: OTHER }

const productInput = (categoryId: string) => ({
  name: 'Panela 500 g',
  price: 3200,
  unit: '500 g',
  imageUrl: '/product-images/abarrotes/panela.png',
  categoryId,
  is_variable_weight: false,
  nutritionalInfo: { serving: 'Por 20 g', calories: 76 },
})

describe('catálogo y tienda sobre PostgreSQL embebido con adapters reales', () => {
  let embedded: EmbeddedPostgres
  let catalog: CatalogRepositoryPostgres
  let store: StoreRepositoryPostgres
  const clock = new TestClock(new Date('2026-10-05T15:00:00.000Z'))
  const deps = () => ({ catalog, clock })

  beforeAll(async () => {
    embedded = await startEmbeddedPostgres()
    catalog = new CatalogRepositoryPostgres(embedded.db)
    store = new StoreRepositoryPostgres(embedded.db)
    await initializeStore({ store, clock })
    await initializeStore({ store, clock }, { storeId: OTHER, overrides: { name: 'Otra tienda' } })
  }, 30_000)

  afterAll(async () => {
    if (embedded) await embedded.close()
  })

  it('la migración 0003 es aditiva: crea tres tablas y no altera las previas', async () => {
    const { rows } = await embedded.pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    )
    expect(rows.map((r) => r.table_name)).toEqual([
      'audit_events', 'auth_accounts', 'auth_rate_limits', 'auth_sessions', 'catalog_categories', 'catalog_products', 'order_creations', 'orders', 'stores',
    ])
    const orderColumns = await embedded.pg.query(`select column_name from information_schema.columns where table_name = 'orders'`)
    // 18 columnas previas intactas; 0006 (T-12) añade 6 al final.
    expect(orderColumns.rows).toHaveLength(24)
  })

  it('tienda: JSONB y columnas ida y vuelta; inicialización idempotente; versión condicionada', async () => {
    const again = await initializeStore({ store, clock })
    expect(again.created).toBe(false)
    expect(again.settings).toMatchObject({
      timeZone: 'America/Bogota',
      contactPhone: null,
      weeklySchedule: { sun: { open: '09:00', close: '14:00', closed: false } },
      timeSlots: [{ id: 'morning', start: '08:00', end: '12:00' }, { id: 'afternoon' }, { id: 'asap' }],
      version: 1,
    })

    const updated = await updateStoreSettings({ store, clock }, owner, { delivery: { enabled: false }, contactPhone: '3101234567' })
    expect(updated).toMatchObject({ version: 2, contactPhone: '573101234567', delivery: { enabled: false, shippingCost: 3000 } })
    expect(await store.updateSettings({ ...again.settings, version: 2 }, 1)).toBeNull()
    expect((await store.findSettings(STORE))?.delivery.enabled).toBe(false)
  })

  it('CHECK de tienda: el número de relleno y la zona ajena no entran ni por SQL directo', async () => {
    for (const statement of [
      `update stores set contact_phone = '573000000000' where id = '${STORE}'`,
      `update stores set time_zone = 'UTC' where id = '${STORE}'`,
      `update stores set shipping_cost = -1 where id = '${STORE}'`,
    ]) {
      await expect(embedded.pg.query(statement), statement).rejects.toMatchObject({ code: '23514' })
    }
  })

  it('seed del baseline: 9 categorías y 16 productos con IDs del baseline; repetirlo no cambia nada', async () => {
    expect(await seedCatalogBaseline(deps(), STORE)).toEqual({
      categoriesInserted: 9, categoriesSkipped: 0, productsInserted: 16, productsSkipped: 0,
    })
    const { products, categories } = await getStaffCatalog(deps(), owner)
    expect(products.map((p) => p.id).slice(0, 3)).toEqual(['leche-entera-1l', 'queso-campesino-250g', 'yogurt-natural-1l'])
    expect(categories[0]?.id).toBe('cat-la')
    expect(products.find((p) => p.id === 'jabon-bano-3pack')?.inStock).toBe(false)

    expect(await seedCatalogBaseline(deps(), STORE)).toMatchObject({ categoriesInserted: 0, productsInserted: 0 })
  })

  it('público: solo activos no archivados; agotado visible; vista staff y otra tienda separadas', async () => {
    await updateProduct(deps(), owner, 'arroz-1kg', { active: false })
    await updateProduct(deps(), owner, 'lenteja-500g', { archived: true })
    const publicIds = (await getPublicCatalog(deps(), STORE)).products.map((p) => p.id)
    expect(publicIds).toHaveLength(14)
    expect(publicIds).not.toContain('arroz-1kg')
    expect(publicIds).not.toContain('lenteja-500g')
    expect(publicIds).toContain('jabon-bano-3pack')
    expect((await getStaffCatalog(deps(), owner)).products).toHaveLength(16)
    expect(await getPublicCatalog(deps(), OTHER)).toEqual({ categories: [], products: [] })
    expect(await catalog.findProduct(OTHER, 'arroz-1kg')).toBeNull()
  })

  it('FK compuesta: un producto no puede usar la categoría de otra tienda, ni saltándose el caso de uso', async () => {
    const foreignCategory = await createCategory(deps(), foreignOwner, { name: 'Ajena', slug: 'lacteos' })
    await expect(createProduct(deps(), owner, productInput(foreignCategory.id))).rejects.toBeInstanceOf(UnknownCategoryError)

    const forged: CatalogProduct = {
      ...(await catalog.findProduct(STORE, 'arroz-1kg'))!,
      id: 'forjado-1',
      categoryId: foreignCategory.id,
    }
    await expect(catalog.createProduct(forged)).rejects.toBeInstanceOf(UnknownCategoryError)
    await expect(
      embedded.pg.query(`update catalog_products set category_id = $1 where id = 'arroz-1kg'`, [foreignCategory.id]),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('CHECK de producto: precio/kg, unidad, COP y precio anterior también en SQL', async () => {
    const base = (await catalog.findProduct(STORE, 'azucar-1kg'))!
    const invalid: Partial<CatalogProduct>[] = [
      { isVariableWeight: true, unit: '1 kg' },
      { unit: 'Por Kilogramo' },
      { price: 0 },
      { originalPrice: base.price },
    ]
    for (const [index, change] of invalid.entries()) {
      await expect(catalog.createProduct({ ...base, ...change, id: `incoherente-${index}` }), JSON.stringify(change)).rejects.toBeInstanceOf(ValidationError)
    }
    await expect(embedded.pg.query(`update catalog_products set currency = 'USD' where id = 'azucar-1kg'`)).rejects.toMatchObject({ code: '23514' })
  })

  it('categoría referenciada (también por archivados) no se borra; vacía o ajena según tienda', async () => {
    await expect(deleteCategory(deps(), owner, 'cat-dp')).rejects.toMatchObject({ code: 'CATEGORY_IN_USE' })
    const seasonal = await createCategory(deps(), owner, { name: 'Temporada', slug: 'temporada' })
    const retired = await createProduct(deps(), owner, productInput(seasonal.id))
    await updateProduct(deps(), owner, retired.id, { archived: true })
    await expect(deleteCategory(deps(), owner, seasonal.id)).rejects.toMatchObject({ code: 'CATEGORY_IN_USE' })

    const empty = await createCategory(deps(), owner, { name: 'Temporal', slug: 'temporal' })
    expect(await catalog.deleteCategory(OTHER, empty.id)).toBe(false)
    await deleteCategory(deps(), owner, empty.id)
    expect(await catalog.findCategory(STORE, empty.id)).toBeNull()
  })

  it('borrado de categoría y alta de producto simultáneos nunca dejan un producto huérfano', async () => {
    const category = await createCategory(deps(), owner, { name: 'Carrera', slug: 'carrera' })
    const [removal, creation] = await Promise.allSettled([
      deleteCategory(deps(), owner, category.id),
      createProduct(deps(), owner, productInput(category.id)),
    ])
    const { rows } = await embedded.pg.query<{ orphans: number }>(
      `select count(*)::int as orphans from catalog_products p
        left join catalog_categories c on c.store_id = p.store_id and c.id = p.category_id
        where c.id is null`,
    )
    expect(rows[0]?.orphans).toBe(0)
    // Exactamente una de las dos operaciones gana.
    expect([removal.status, creation.status].sort()).toEqual(['fulfilled', 'rejected'])
    const loser = [removal, creation].find((result) => result.status === 'rejected') as PromiseRejectedResult
    const expected = removal.status === 'rejected' ? { code: 'CATEGORY_IN_USE' } : { code: 'VALIDATION_ERROR', name: 'UnknownCategoryError' }
    expect(loser.reason).toMatchObject(expected)
  })

  it('slug único por tienda y edición condicionada por versión', async () => {
    await expect(createCategory(deps(), owner, { name: 'Lácteos 2', slug: 'lacteos' })).rejects.toMatchObject({ code: 'CATEGORY_SLUG_TAKEN' })
    const product = await createProduct(deps(), owner, productInput('cat-dp'))
    expect(product.nutritionalInfo).toEqual({ serving: 'Por 20 g', calories: 76 })
    await updateProduct(deps(), owner, product.id, { price: 3500 })
    expect(await catalog.updateProduct({ ...product, price: 1, version: 2 }, product.version)).toBeNull()
    expect((await catalog.findProduct(STORE, product.id))?.price).toBe(3500)
  })
})
