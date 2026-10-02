/** Puerto portable. Solo imágenes comerciales; nunca recibe nombres/rutas del navegador. */
export interface StoredProductImage {
  url: string
  pathname: string
}

export interface ProductImageStorage {
  put(storeId: string, webp: Uint8Array): Promise<StoredProductImage>
  /** Solo la imagen recién subida por la misma operación, si no quedó asociada. */
  removeNew(image: StoredProductImage): Promise<void>
}

export interface ProductImageProcessor {
  toWebp(input: Uint8Array): Promise<Uint8Array>
}

export class ImageStorageUnavailableError extends Error {
  constructor() {
    super('El almacenamiento de imágenes no está disponible')
    this.name = 'ImageStorageUnavailableError'
  }
}
