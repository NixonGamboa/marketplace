import type { VercelRequest } from '@vercel/node'
import { PRODUCT_IMAGE_LIMITS } from '../../shared/contracts/media.js'
import { AuthRequestError, readJsonBody } from './auth.js'

export const imageVersionFrom = (req: VercelRequest): number => {
  const raw = req.query.version
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new AuthRequestError(400, 'INVALID_VERSION', 'Falta la versión vigente del producto')
  }
  return Number(raw)
}

/** No se admite MIME/nombre/path del cliente: el decoder decide el formato por bytes. */
export const readProductImage = (req: VercelRequest): Uint8Array => {
  const body = readJsonBody(req, PRODUCT_IMAGE_LIMITS.jsonBytes)
  const value = body.imageBase64
  if (Object.keys(body).length !== 1 || typeof value !== 'string' || !value ||
      value.length > 4 * Math.ceil(PRODUCT_IMAGE_LIMITS.inputBytes / 3) ||
      value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) {
    throw new AuthRequestError(400, 'INVALID_IMAGE', 'Se requiere una imagen base64 válida de hasta 3 MiB')
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.byteLength === 0 || decoded.byteLength > PRODUCT_IMAGE_LIMITS.inputBytes || decoded.toString('base64') !== value) {
    throw new AuthRequestError(400, 'INVALID_IMAGE', 'Imagen base64 inválida')
  }
  return decoded
}
