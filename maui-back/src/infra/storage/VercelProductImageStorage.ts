import { randomUUID } from 'node:crypto'
import { del, put } from '@vercel/blob'
import { entityIdSchema } from '../../../../shared/contracts/common.js'
import { PRODUCT_IMAGE_LIMITS } from '../../../../shared/contracts/media.js'
import { ImageStorageUnavailableError, type ProductImageStorage, type StoredProductImage } from '../../domain/catalog/ProductImageStorage.js'
import { ConfigurationError } from '../../shared/config.js'

export interface ProductImageStorageConfig {
  token: string
  publicHost: string
}

/** Test solamente. Compara ID del token/store/host antes de cualquier operación de Blob. */
export function loadProductImageStorageConfig(env: NodeJS.ProcessEnv): ProductImageStorageConfig {
  const reject = (): never => { throw new ConfigurationError(['TEST_BLOB_CONFIGURATION_REQUIRED']) }
  if (env.APP_ENV !== 'test' || env.VERCEL_ENV === 'production' ||
      ['master', 'main'].includes(env.VERCEL_GIT_COMMIT_REF ?? '')) return reject()
  const storeId = env.BLOB_STORE_ID?.replace(/^store_/, '')
  const expectedId = env.TEST_BLOB_STORE_ID?.replace(/^store_/, '')
  const token = env.BLOB_READ_WRITE_TOKEN
  if (!storeId || !/^[a-zA-Z0-9]+$/.test(storeId) || storeId !== expectedId ||
      !token || !token.startsWith(`vercel_blob_rw_${storeId}_`)) return reject()
  const publicHost = `${storeId.toLowerCase()}.public.blob.vercel-storage.com`
  if (env.TEST_BLOB_PUBLIC_HOST !== publicHost) return reject()
  return { token, publicHost }
}

export class VercelProductImageStorage implements ProductImageStorage {
  /** Rastrea únicamente blobs creados por esta instancia/request; no acepta URLs externas. */
  private readonly created = new Map<string, string>()

  constructor(private readonly config: ProductImageStorageConfig) {}

  async put(storeId: string, webp: Uint8Array): Promise<StoredProductImage> {
    if (!entityIdSchema.safeParse(storeId).success || webp.byteLength > PRODUCT_IMAGE_LIMITS.outputBytes) {
      throw new ImageStorageUnavailableError()
    }
    const pathname = `test/stores/${storeId}/products/${randomUUID()}.webp`
    try {
      const image = await put(pathname, Buffer.from(webp), {
        access: 'public', token: this.config.token, contentType: 'image/webp',
        addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 31536000,
      })
      if (new URL(image.url).hostname !== this.config.publicHost || image.pathname !== pathname) {
        throw new ImageStorageUnavailableError()
      }
      this.created.set(image.url, pathname)
      return { url: image.url, pathname }
    } catch { throw new ImageStorageUnavailableError() }
  }

  async removeNew(image: StoredProductImage): Promise<void> {
    if (this.created.get(image.url) !== image.pathname) throw new ImageStorageUnavailableError()
    try {
      await del(image.url, { token: this.config.token })
      this.created.delete(image.url)
    } catch { throw new ImageStorageUnavailableError() }
  }
}
