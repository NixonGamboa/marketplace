import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProductImageStorage, StoredProductImage } from '../../src/domain/catalog/ProductImageStorage.js'
import type { StoreActor } from '../../src/domain/store/storeAccess.js'
import { HmacBucketKeyer } from '../../src/infra/auth/randomIds.js'
import { AuthRepositoryPostgres } from '../../src/infra/postgres/AuthRepositoryPostgres.js'
import { CatalogRepositoryPostgres } from '../../src/infra/postgres/CatalogRepositoryPostgres.js'
import { StoreRepositoryPostgres } from '../../src/infra/postgres/StoreRepositoryPostgres.js'
import { SharpProductImageProcessor } from '../../src/infra/storage/SharpProductImageProcessor.js'
import { seedCatalogBaseline } from '../../src/usecases/catalog/seedCatalogBaseline.js'
import { uploadProductImage, type UploadProductImageDeps } from '../../src/usecases/catalog/uploadProductImage.js'
import { initializeStore } from '../../src/usecases/store/initializeStore.js'
import { TEST_SECRET, TestClock } from '../auth/fixtures.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

class FakeStorage implements ProductImageStorage {
  uploaded: StoredProductImage[] = []
  removed: StoredProductImage[] = []
  async put(): Promise<StoredProductImage> {
    const image = { url: `https://test.public.blob.vercel-storage.com/test/${this.uploaded.length}.webp`, pathname: `test/${this.uploaded.length}.webp` }
    this.uploaded.push(image)
    return image
  }
  async removeNew(image: StoredProductImage): Promise<void> { this.removed.push(image) }
}

describe('imagen: asociación CAS y cuota sobre PostgreSQL real embebido', () => {
  let embedded: EmbeddedPostgres
  let deps: UploadProductImageDeps
  const owner: StoreActor = { id: 'owner-image', role: 'owner', storeId: 'leche-y-miel' }
  const productId = 'queso-campesino-250g'
  const clock = new TestClock(new Date('2026-10-02T12:00:00.000Z'))
  const keys = new HmacBucketKeyer(TEST_SECRET)
  const storage = new FakeStorage()
  const png = () => sharp({ create: { width: 24, height: 16, channels: 3, background: 'red' } }).png().toBuffer()
  beforeAll(async () => {
    embedded = await startEmbeddedPostgres()
    const catalog = new CatalogRepositoryPostgres(embedded.db)
    const store = new StoreRepositoryPostgres(embedded.db)
    await initializeStore({ store, clock })
    await seedCatalogBaseline({ catalog, clock }, 'leche-y-miel')
    deps = { catalog, clock, storage, keys, processor: new SharpProductImageProcessor(), attempts: new AuthRepositoryPostgres(embedded.db) }
  }, 30_000)
  afterAll(async () => { if (embedded) await embedded.close() })

  it('persiste URL y version en fila de tienda sin alterar el resto del producto', async () => {
    const before = (await deps.catalog.findProduct('leche-y-miel', productId))!
    const after = await uploadProductImage(deps, owner, productId, 1, png)
    const rows = await embedded.pg.query<{ image_url: string; version: number }>(
      'select image_url, version from catalog_products where store_id=$1 and id=$2', ['leche-y-miel', productId])
    expect(rows.rows[0]).toEqual({ image_url: after.imageUrl, version: 2 })
    expect(after).toMatchObject({ price: before.price, categoryId: before.categoryId, isVariableWeight: before.isVariableWeight })
    expect(storage.removed).toEqual([])
    await expect(uploadProductImage(deps, { ...owner, storeId: 'otra-tienda' }, productId, 2, png)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('dos requests concurrentes dan un solo ganador y eliminan solo el blob perdedor', async () => {
    const results = await Promise.allSettled([
      uploadProductImage(deps, owner, productId, 2, png), uploadProductImage(deps, owner, productId, 2, png),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    const persisted = (await deps.catalog.findProduct('leche-y-miel', productId))!
    expect(persisted.version).toBe(3)
    expect(storage.removed).toHaveLength(1)
    expect(storage.removed[0]?.url).not.toBe(persisted.imageUrl)
  })
  it('la cuota persiste y se comparte entre adapters distintos; renueva después de una hora', async () => {
    const actor = { ...owner, id: 'owner-limited' }
    for (let i = 0; i < 30; i++) await expect(uploadProductImage(deps, actor, productId, 3, () => Buffer.from('invalida')))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    const another = { ...deps, attempts: new AuthRepositoryPostgres(embedded.db) }
    await expect(uploadProductImage(another, actor, productId, 3, png)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 3600 })
    const result = await embedded.pg.query<{ attempts: number }>('select attempts from auth_rate_limits where bucket=$1',
      [keys.key('catalog-image-account', actor.id)])
    expect(result.rows[0]?.attempts).toBe(31)
    clock.advanceSeconds(3600)
    expect((await uploadProductImage(another, actor, productId, 3, png)).version).toBe(4)
  })
})
