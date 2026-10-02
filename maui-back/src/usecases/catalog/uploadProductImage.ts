import type { AuthRepository } from '../../domain/auth/AuthRepository.js'
import type { BucketKeyer } from '../../domain/auth/ports.js'
import type { CatalogProduct } from '../../domain/catalog/Catalog.js'
import type { CatalogRepository } from '../../domain/catalog/CatalogRepository.js'
import { CatalogConflictError } from '../../domain/catalog/errors.js'
import { ImageStorageUnavailableError, type ProductImageProcessor, type ProductImageStorage } from '../../domain/catalog/ProductImageStorage.js'
import { ownedStoreOf, type StoreActor } from '../../domain/store/storeAccess.js'
import type { Clock } from '../../shared/clock.js'
import { NotFoundError } from '../../shared/errors.js'
import { reserveAttemptOrThrow } from '../auth/reserveAttempt.js'

export interface UploadProductImageDeps {
  catalog: Pick<CatalogRepository, 'findProduct' | 'updateProduct'>
  attempts: Pick<AuthRepository, 'reserveAttempt'>
  keys: BucketKeyer
  clock: Clock
  processor: ProductImageProcessor
  storage: ProductImageStorage
}

/** Cotas persistentes por cuenta y tienda, compartidas entre instancias del runtime. */
export const IMAGE_UPLOAD_ACCOUNT_POLICY = { limit: 30, windowSeconds: 3600 } as const
export const IMAGE_UPLOAD_STORE_POLICY = { limit: 100, windowSeconds: 86400 } as const

export const uploadProductImage = async (
  deps: UploadProductImageDeps,
  actor: StoreActor,
  id: string,
  expectedVersion: number,
  readImage: () => Uint8Array | Promise<Uint8Array>,
): Promise<CatalogProduct> => {
  const storeId = ownedStoreOf(actor)
  const current = await deps.catalog.findProduct(storeId, id)
  if (!current || current.archivedAt !== null) throw new NotFoundError('Product', id)
  if (current.version !== expectedVersion) throw new CatalogConflictError('CATALOG_CONCURRENT_UPDATE')
  // Antes de leer/decodificar: inválidos costosos también consumen una reserva; roles ajenos no.
  await reserveAttemptOrThrow({ repository: deps.attempts, clock: deps.clock }, {
    bucket: deps.keys.key('catalog-image-account', actor.id), ...IMAGE_UPLOAD_ACCOUNT_POLICY,
  })
  await reserveAttemptOrThrow({ repository: deps.attempts, clock: deps.clock }, {
    bucket: deps.keys.key('catalog-image-store', storeId), ...IMAGE_UPLOAD_STORE_POLICY,
  })
  const webp = await deps.processor.toWebp(await readImage())
  const image = await deps.storage.put(storeId, webp)
  const updated = await deps.catalog.updateProduct({
    ...current, imageUrl: image.url, version: current.version + 1, updatedAt: deps.clock.nowIso(),
  }, expectedVersion)
  // Si SQL lanza, el resultado es incierto y se conserva el blob para reconciliación:
  // nunca borrar una imagen cuyo UPDATE podría confirmar después de un timeout.
  if (!updated) {
    // CAS rechazado de forma definitiva: el blob nuevo nunca quedó referenciado.
    try { await deps.storage.removeNew(image) } catch { throw new ImageStorageUnavailableError() }
    throw new CatalogConflictError('CATALOG_CONCURRENT_UPDATE')
  }
  return updated
}
