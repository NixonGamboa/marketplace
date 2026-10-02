import { beforeEach, describe, expect, it } from 'vitest'
import { AuthorizationError } from '../../../src/domain/auth/errors.js'
import { CatalogConflictError, UnknownCategoryError } from '../../../src/domain/catalog/errors.js'
import type { StoreActor } from '../../../src/domain/store/storeAccess.js'
import { CatalogRepositoryMemory } from '../../../src/infra/memory/CatalogRepositoryMemory.js'
import { StoreRepositoryMemory } from '../../../src/infra/memory/StoreRepositoryMemory.js'
import { NotFoundError, ValidationError } from '../../../src/shared/errors.js'
import { createCategory, deleteCategory, updateCategory } from '../../../src/usecases/catalog/manageCategories.js'
import { createProduct, updateProduct } from '../../../src/usecases/catalog/manageProducts.js'
import { getPublicCatalog, getPublicProduct, getStaffCatalog } from '../../../src/usecases/catalog/readCatalog.js'
import { seedCatalogBaseline } from '../../../src/usecases/catalog/seedCatalogBaseline.js'
import { initializeStore } from '../../../src/usecases/store/initializeStore.js'
import { TestClock } from '../../auth/fixtures.js'

const STORE = 'leche-y-miel'
const OTHER = 'otra-tienda'

const owner: StoreActor = { id: 'acc_owner', role: 'owner', storeId: STORE }
const operator: StoreActor = { id: 'acc_operator', role: 'operator', storeId: STORE }
const customer: StoreActor = { id: 'acc_customer', role: 'customer', storeId: null }
const foreignOwner: StoreActor = { id: 'acc_foreign', role: 'owner', storeId: OTHER }

const productInput = (categoryId: string) => ({
  name: 'Arroz blanco 1kg',
  price: 5500,
  unit: '1 kg',
  imageUrl: '/product-images/abarrotes/arroz.png',
  categoryId,
  is_variable_weight: false,
})

describe('casos de uso del catálogo', () => {
  let catalog: CatalogRepositoryMemory
  let clock: TestClock
  let deps: { catalog: CatalogRepositoryMemory; clock: TestClock }
  let categoryId: string

  beforeEach(async () => {
    const store = new StoreRepositoryMemory()
    clock = new TestClock(new Date('2026-10-05T15:00:00.000Z'))
    catalog = new CatalogRepositoryMemory((id) => store.hasStore(id))
    deps = { catalog, clock }
    await initializeStore({ store, clock }, { storeId: STORE })
    await initializeStore({ store, clock }, { storeId: OTHER, overrides: { name: 'Otra tienda' } })
    categoryId = (await createCategory(deps, owner, { name: 'Mi despensa', slug: 'mi-despensa', order: 1 })).id
  })

  it('solo el owner administra; operator y cliente reciben 403 sin escribir', async () => {
    for (const actor of [operator, customer]) {
      await expect(createProduct(deps, actor, productInput(categoryId))).rejects.toBeInstanceOf(AuthorizationError)
      await expect(createCategory(deps, actor, { name: 'X' })).rejects.toBeInstanceOf(AuthorizationError)
      await expect(deleteCategory(deps, actor, categoryId)).rejects.toBeInstanceOf(AuthorizationError)
    }
    expect((await getStaffCatalog(deps, owner)).products).toHaveLength(0)
  })

  it('la tienda sale de la sesión: el owner ajeno no ve ni toca la tienda', async () => {
    const product = await createProduct(deps, owner, productInput(categoryId))
    expect(product.storeId).toBe(STORE)

    await expect(updateProduct(deps, foreignOwner, product.id, { price: 1 })).rejects.toBeInstanceOf(NotFoundError)
    await expect(updateCategory(deps, foreignOwner, categoryId, { name: 'Robada' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(deleteCategory(deps, foreignOwner, categoryId)).rejects.toBeInstanceOf(NotFoundError)
    expect((await getStaffCatalog(deps, foreignOwner)).products).toEqual([])
    expect(await getPublicCatalog(deps, OTHER)).toEqual({ categories: [], products: [] })
  })

  it('no usa la categoría de otra tienda (mismo error que inexistente)', async () => {
    const foreignCategory = await createCategory(deps, foreignOwner, { name: 'Ajena' })
    await expect(createProduct(deps, owner, productInput(foreignCategory.id))).rejects.toBeInstanceOf(UnknownCategoryError)
    await expect(createProduct(deps, owner, productInput('cat-inexistente'))).rejects.toBeInstanceOf(UnknownCategoryError)

    const product = await createProduct(deps, owner, productInput(categoryId))
    await expect(updateProduct(deps, owner, product.id, { categoryId: foreignCategory.id })).rejects.toBeInstanceOf(UnknownCategoryError)
  })

  it('el operador lee la vista de personal; el cliente no', async () => {
    await createProduct(deps, owner, { ...productInput(categoryId), active: false })
    expect((await getStaffCatalog(deps, operator)).products).toHaveLength(1)
    await expect(getStaffCatalog(deps, customer)).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('activo, agotado y archivado son independientes; público solo ve activos no archivados', async () => {
    const visible = await createProduct(deps, owner, productInput(categoryId))
    const soldOut = await createProduct(deps, owner, { ...productInput(categoryId), name: 'Agotado', inStock: false })
    const hidden = await createProduct(deps, owner, { ...productInput(categoryId), name: 'Oculto', active: false })
    const archived = await createProduct(deps, owner, { ...productInput(categoryId), name: 'Archivado' })
    clock.advanceSeconds(60)
    const archivedNow = await updateProduct(deps, owner, archived.id, { archived: true })
    expect(archivedNow.archivedAt).toBe(clock.nowIso())
    expect(archivedNow.active).toBe(true)

    const publicIds = (await getPublicCatalog(deps, STORE)).products.map((p) => p.id)
    expect(publicIds.sort()).toEqual([visible.id, soldOut.id].sort())
    for (const id of [hidden.id, archived.id]) {
      await expect(getPublicProduct(deps, STORE, id)).rejects.toBeInstanceOf(NotFoundError)
    }
    expect((await getPublicProduct(deps, STORE, soldOut.id)).inStock).toBe(false)
    expect((await getStaffCatalog(deps, owner)).products).toHaveLength(4)

    const restored = await updateProduct(deps, owner, archived.id, { archived: false })
    expect(restored.archivedAt).toBeNull()
    expect(restored.id).toBe(archived.id)
  })

  it('valida el producto fusionado: precio/kg, unidad y precio anterior', async () => {
    const product = await createProduct(deps, owner, { ...productInput(categoryId), originalPrice: 7000 })
    await expect(updateProduct(deps, owner, product.id, { price: 7000 })).rejects.toBeInstanceOf(ValidationError)
    await expect(updateProduct(deps, owner, product.id, { unit: 'Por Kilogramo' })).rejects.toBeInstanceOf(ValidationError)

    const byKg = await updateProduct(deps, owner, product.id, { is_variable_weight: true, originalPrice: null })
    expect(byKg).toMatchObject({ isVariableWeight: true, unit: 'Por Kilogramo', originalPrice: null })
    await expect(updateProduct(deps, owner, product.id, { is_variable_weight: false })).rejects.toBeInstanceOf(ValidationError)
    expect(await updateProduct(deps, owner, product.id, { is_variable_weight: false, unit: '500 g' })).toMatchObject({ unit: '500 g' })
    await expect(updateProduct(deps, owner, product.id, { price: -5 })).rejects.toBeInstanceOf(ValidationError)
  })

  it('una edición basada en una versión vieja produce conflicto y no pisa la otra', async () => {
    const product = await createProduct(deps, owner, productInput(categoryId))
    const stale = { ...product }
    await updateProduct(deps, owner, product.id, { price: 6000 })
    expect(await catalog.updateProduct({ ...stale, price: 1, version: stale.version + 1 }, stale.version)).toBeNull()
    expect((await catalog.findProduct(STORE, product.id))?.price).toBe(6000)
  })

  it('categoría con productos (incluso archivados) no se borra; vacía sí', async () => {
    const product = await createProduct(deps, owner, productInput(categoryId))
    await updateProduct(deps, owner, product.id, { archived: true })
    await expect(deleteCategory(deps, owner, categoryId)).rejects.toMatchObject({ code: 'CATEGORY_IN_USE' })

    const empty = await createCategory(deps, owner, { name: 'Vacía' })
    await deleteCategory(deps, owner, empty.id)
    await expect(deleteCategory(deps, owner, empty.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('slug único por tienda y tienda inicializada', async () => {
    await expect(createCategory(deps, owner, { name: 'Otra', slug: 'mi-despensa' })).rejects.toMatchObject({ code: 'CATEGORY_SLUG_TAKEN' })
    expect((await createCategory(deps, foreignOwner, { name: 'Mi despensa', slug: 'mi-despensa' })).storeId).toBe(OTHER)
    const orphanOwner: StoreActor = { id: 'acc_x', role: 'owner', storeId: 'sin-config' }
    await expect(createCategory(deps, orphanOwner, { name: 'X' })).rejects.toBeInstanceOf(CatalogConflictError)
  })

  it('seed del baseline idempotente: conserva IDs, orden y ediciones posteriores', async () => {
    const first = await seedCatalogBaseline(deps, STORE)
    expect(first).toEqual({ categoriesInserted: 9, categoriesSkipped: 0, productsInserted: 16, productsSkipped: 0 })
    const staff = await getStaffCatalog(deps, owner)
    expect(staff.products[0]?.id).toBe('leche-entera-1l')
    expect(staff.categories.slice(0, 2).map((c) => c.id)).toEqual([categoryId, 'cat-la'])

    await updateProduct(deps, owner, 'leche-entera-1l', { price: 4900 })
    const second = await seedCatalogBaseline(deps, STORE)
    expect(second).toEqual({ categoriesInserted: 0, categoriesSkipped: 9, productsInserted: 0, productsSkipped: 16 })
    expect((await catalog.findProduct(STORE, 'leche-entera-1l'))?.price).toBe(4900)
    expect((await getPublicCatalog(deps, STORE)).products.find((p) => p.id === 'queso-campesino-250g')).toMatchObject({
      isVariableWeight: true,
      unit: 'Por Kilogramo',
      price: 7500,
    })
  })
})
