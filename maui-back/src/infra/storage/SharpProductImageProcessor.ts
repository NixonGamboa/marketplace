import sharp from 'sharp'
import { PRODUCT_IMAGE_LIMITS as LIMITS } from '../../../../shared/contracts/media.js'
import type { ProductImageProcessor } from '../../domain/catalog/ProductImageStorage.js'
import { ValidationError } from '../../shared/errors.js'

const invalidImage = (): ValidationError => new ValidationError('Imagen inválida: use JPEG, PNG o WebP estático, hasta 3 MiB')

const animatedPng = (bytes: Buffer): boolean => {
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    if (type === 'acTL') return true
    if (size > bytes.length - offset - 12) throw invalidImage()
    offset += size + 12
    if (type === 'IEND') return false
  }
  return false
}

/** Decodifica bytes reales, limita píxeles antes de expandir y elimina EXIF/GPS por defecto. */
export class SharpProductImageProcessor implements ProductImageProcessor {
  async toWebp(input: Uint8Array): Promise<Uint8Array> {
    if (input.byteLength === 0 || input.byteLength > LIMITS.inputBytes) throw invalidImage()
    const bytes = Buffer.from(input)
    // Lista positiva de firmas antes de invocar un decoder (SVG/TIFF/HEIC nunca se procesan).
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const webp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    if (!jpeg && !png && !webp) throw invalidImage()
    if (png && animatedPng(bytes)) throw invalidImage()
    try {
      const image = sharp(bytes, { limitInputPixels: LIMITS.maxPixels, failOn: 'warning', sequentialRead: true })
      const metadata = await image.metadata()
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || !metadata.width || !metadata.height ||
          metadata.width > LIMITS.maxInputDimension || metadata.height > LIMITS.maxInputDimension ||
          metadata.width * metadata.height > LIMITS.maxPixels || (metadata.pages ?? 1) !== 1) throw invalidImage()
      const output = await image.rotate().resize(LIMITS.maxOutputDimension, LIMITS.maxOutputDimension, {
        fit: 'inside', withoutEnlargement: true,
      }).webp({ quality: 78, effort: 4 }).toBuffer()
      if (output.byteLength > LIMITS.outputBytes) throw new ValidationError('La imagen comprimida supera 1 MiB; elija una imagen más pequeña')
      return output
    } catch (error) {
      if (error instanceof ValidationError) throw error
      throw invalidImage()
    }
  }
}
