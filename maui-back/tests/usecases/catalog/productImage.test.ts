import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRODUCT_IMAGE_LIMITS } from '../../../../shared/contracts/media.js'
import type { StoreActor } from '../../../src/domain/store/storeAccess.js'
import type { ProductImageStorage, StoredProductImage } from '../../../src/domain/catalog/ProductImageStorage.js'
import { CatalogRepositoryMemory } from '../../../src/infra/memory/CatalogRepositoryMemory.js'
import { SharpProductImageProcessor } from '../../../src/infra/storage/SharpProductImageProcessor.js'
import { loadProductImageStorageConfig, VercelProductImageStorage } from '../../../src/infra/storage/VercelProductImageStorage.js'
import { seedCatalogBaseline } from '../../../src/usecases/catalog/seedCatalogBaseline.js'
import { uploadProductImage, type UploadProductImageDeps } from '../../../src/usecases/catalog/uploadProductImage.js'
import { createAuthFixture } from '../../auth/fixtures.js'

const id = 'queso-campesino-250g'
const owner: StoreActor = { id: 'owner', role: 'owner', storeId: 'leche-y-miel' }
const png = () => sharp({ create: { width: 64, height: 32, channels: 3, background: '#ffa500' } }).png().toBuffer()

class FakeStorage implements ProductImageStorage {
  uploaded: StoredProductImage[] = []
  removed: StoredProductImage[] = []
  async put(storeId: string): Promise<StoredProductImage> {
    const image = { url: `https://test.public.blob.vercel-storage.com/test/stores/${storeId}/${this.uploaded.length}.webp`, pathname: `${this.uploaded.length}.webp` }
    this.uploaded.push(image)
    return image
  }
  async removeNew(image: StoredProductImage): Promise<void> { this.removed.push(image) }
}

describe('imagen comercial: decodificación y compresión real', () => {
  const processor = new SharpProductImageProcessor()
  it.each(['jpeg', 'png', 'webp'] as const)('admite %s real y produce WebP sin EXIF/GPS', async format => {
    const input = await sharp({ create: { width: 1800, height: 900, channels: 3, background: '#abcdef' } })
      .withMetadata().toFormat(format).toBuffer()
    const output = await processor.toWebp(input)
    const metadata = await sharp(output).metadata()
    expect(metadata).toMatchObject({ format: 'webp', width: 1600, height: 800 })
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
    expect(output.byteLength).toBeLessThanOrEqual(PRODUCT_IMAGE_LIMITS.outputBytes)
  })
  it.each([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('GIF89a'), Buffer.from('hola'),
    Buffer.from([255, 216, 255, 0]), Buffer.alloc(0), Buffer.alloc(PRODUCT_IMAGE_LIMITS.inputBytes + 1)])('rechaza archivo inválido sin Blob', async input => {
    await expect(processor.toWebp(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
  it('rechaza bomba de píxeles aunque el PNG comprimido sea pequeño', async () => {
    const input = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: 'white' } }).png().toBuffer()
    expect(input.length).toBeLessThan(PRODUCT_IMAGE_LIMITS.inputBytes)
    await expect(processor.toWebp(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
  it('rechaza APNG antes de decodificar frames', async () => {
    const source = await png()
    const control = Buffer.alloc(20)
    control.writeUInt32BE(8, 0)
    control.write('acTL', 4, 'ascii')
    control.writeUInt32BE(2, 8)
    const input = Buffer.concat([source.subarray(0, 8), control, source.subarray(8)])
    await expect(processor.toWebp(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
  it('rechaza WebP animado real en lugar de guardar solo el primer frame', async () => {
    const source = await sharp(Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]), {
      raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
    }).webp({ loop: 0, delay: [100, 100] }).toBuffer()
    expect((await sharp(source, { animated: true }).metadata()).pages).toBe(2)
    await expect(processor.toWebp(source)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})

describe('upload: permiso, cuotas y asociación sin pérdidas', () => {
  let deps: UploadProductImageDeps
  let storage: FakeStorage
  beforeEach(async () => {
    const fixture = createAuthFixture()
    const catalog = new CatalogRepositoryMemory(() => true)
    await seedCatalogBaseline({ catalog, clock: fixture.clock }, owner.storeId!)
    storage = new FakeStorage()
    deps = { catalog, storage, processor: new SharpProductImageProcessor(), attempts: fixture.repository, keys: fixture.deps.keys, clock: fixture.clock }
  })
  const upload = async () => uploadProductImage(deps, owner, id, 1, png)
  it('persiste URL nueva y versión; conserva la imagen anterior sin borrarla', async () => {
    const before = await deps.catalog.findProduct(owner.storeId!, id)
    const after = await upload()
    expect(after).toMatchObject({ version: 2, imageUrl: storage.uploaded[0]?.url })
    expect(after.imageUrl).not.toBe(before?.imageUrl)
    expect(await deps.catalog.findProduct(owner.storeId!, id)).toEqual(after)
    expect(storage.removed).toEqual([])
  })
  it.each(['customer', 'operator'] as const)('deniega %s antes de leer imagen/consumir cuota', async role => {
    const read = vi.fn(png)
    const reserve = vi.spyOn(deps.attempts, 'reserveAttempt')
    await expect(uploadProductImage(deps, { ...owner, role }, id, 1, read)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(read).not.toHaveBeenCalled()
    expect(reserve).not.toHaveBeenCalled()
  })
  it('tienda ajena, inexistente y archivado son 404 antes de leer', async () => {
    const read = vi.fn(png)
    for (const [actor, productId] of [[{ ...owner, storeId: 'otra' }, id], [owner, 'no-existe']] as const) {
      await expect(uploadProductImage(deps, actor, productId, 1, read)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    const current = (await deps.catalog.findProduct(owner.storeId!, id))!
    await deps.catalog.updateProduct({ ...current, archivedAt: deps.clock.nowIso(), version: 2 }, 1)
    await expect(uploadProductImage(deps, owner, id, 2, read)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(read).not.toHaveBeenCalled()
  })
  it('versión obsoleta deniega antes de Blob/cuota', async () => {
    const reserve = vi.spyOn(deps.attempts, 'reserveAttempt')
    await expect(uploadProductImage(deps, owner, id, 9, png)).rejects.toMatchObject({ code: 'CATALOG_CONCURRENT_UPDATE' })
    expect(reserve).not.toHaveBeenCalled()
    expect(storage.uploaded).toEqual([])
  })
  it('concurrencia: un ganador y un 409; borra solo el blob nuevo perdedor', async () => {
    const results = await Promise.allSettled([upload(), upload()])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
    const persisted = await deps.catalog.findProduct(owner.storeId!, id)
    expect(storage.removed).toHaveLength(1)
    expect(storage.removed[0]?.url).not.toBe(persisted?.imageUrl)
  })
  it('resultado SQL incierto conserva la imagen nueva para reconciliación', async () => {
    vi.spyOn(deps.catalog, 'updateProduct').mockRejectedValue(new Error('timeout'))
    await expect(upload()).rejects.toThrow('timeout')
    expect(storage.uploaded).toHaveLength(1)
    expect(storage.removed).toEqual([])
  })
  it('error de limpieza se informa; nunca prueba eliminar una imagen histórica', async () => {
    vi.spyOn(deps.catalog, 'updateProduct').mockResolvedValue(null)
    vi.spyOn(storage, 'removeNew').mockRejectedValue(new Error('unavailable'))
    await expect(upload()).rejects.toThrow('El almacenamiento de imágenes no está disponible')
    expect(storage.uploaded).toHaveLength(1)
  })
  it('limita 30 intentos por cuenta/hora antes de decodificar', async () => {
    const read = vi.fn(() => Buffer.from('invalida'))
    for (let i = 0; i < 30; i++) await expect(uploadProductImage(deps, owner, id, 1, read)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(uploadProductImage(deps, owner, id, 1, read)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 3600 })
    expect(read).toHaveBeenCalledTimes(30)
    expect(storage.uploaded).toEqual([])
  })
  it('cota diaria de tienda compartida entre owners; buckets no contienen IDs', async () => {
    const reserve = vi.spyOn(deps.attempts, 'reserveAttempt')
    const read = vi.fn(() => Buffer.from('invalida'))
    for (let i = 0; i < 100; i++) await expect(uploadProductImage(deps, { ...owner, id: `owner-${Math.floor(i / 25)}` }, id, 1, read))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(uploadProductImage(deps, { ...owner, id: 'owner-new' }, id, 1, read)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    expect(read).toHaveBeenCalledTimes(100)
    for (const [rule] of reserve.mock.calls) expect(rule.bucket).not.toMatch(/owner|leche-y-miel/)
  })
})

describe('aislamiento Blob antes de llamadas externas', () => {
  const env = { APP_ENV: 'test', BLOB_STORE_ID: 'store_Test123', TEST_BLOB_STORE_ID: 'store_Test123',
    BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_Test123_unit-only', TEST_BLOB_PUBLIC_HOST: 'test123.public.blob.vercel-storage.com' }
  it('acepta solo la combinación exacta token/store/host test', () => {
    expect(loadProductImageStorageConfig(env)).toMatchObject({ publicHost: env.TEST_BLOB_PUBLIC_HOST })
  })
  it.each([{ APP_ENV: 'production' }, { APP_ENV: 'local' }, { VERCEL_ENV: 'production' }, { VERCEL_GIT_COMMIT_REF: 'master' },
    { BLOB_STORE_ID: 'store_Otra' }, { TEST_BLOB_STORE_ID: 'store_Otra' }, { TEST_BLOB_PUBLIC_HOST: 'prod.public.blob.vercel-storage.com' },
    { BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_Prod_secret' }, { BLOB_READ_WRITE_TOKEN: '' }])('veta configuración insegura %j', patch => {
    expect(() => loadProductImageStorageConfig({ ...env, ...patch })).toThrow('La configuración del servidor es inválida')
  })
  it('no borra una URL/path que no creó la misma request', async () => {
    const storage = new VercelProductImageStorage(loadProductImageStorageConfig(env))
    await expect(storage.removeNew({ url: 'https://example.org/old.webp', pathname: 'old.webp' })).rejects.toThrow()
  })
})
