import { staffProductDtoSchema, type StaffProductDto } from '../../../shared/contracts/catalog'
import { PRODUCT_IMAGE_LIMITS } from '../../../shared/contracts/media'

const base64Of = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result !== 'string') { reject(new Error('No se pudo leer la imagen')); return }
    resolve(reader.result.slice(reader.result.indexOf(',') + 1))
  }
  reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
  reader.readAsDataURL(file)
})

/** Servicio real exclusivamente: cookie de sesión y token Blob siempre en el servidor. */
export async function uploadProductImageFile(id: string, version: number, file: File): Promise<StaffProductDto> {
  if (file.size === 0 || file.size > PRODUCT_IMAGE_LIMITS.inputBytes) throw new Error('La imagen debe pesar entre 1 byte y 3 MiB')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch(`/api/catalog/products/${encodeURIComponent(id)}/image?version=${version}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ imageBase64: await base64Of(file) }),
    })
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: 'Imagen inválida. Usa JPEG, PNG o WebP de hasta 3 MiB.',
        401: 'Tu sesión expiró. Vuelve a iniciar sesión.',
        403: 'No tienes permiso para cambiar esta imagen.',
        404: 'El producto ya no está disponible.',
        409: 'El producto cambió. Recarga antes de subir la imagen.',
        413: 'La imagen supera el tamaño permitido.',
        429: 'Se alcanzó el límite de imágenes. Intenta más tarde.',
        503: 'El almacenamiento no está disponible. Intenta más tarde.',
      }
      throw new Error(messages[response.status] ?? 'No se pudo guardar la imagen')
    }
    const product = staffProductDtoSchema.safeParse(await response.json())
    if (!product.success || product.data.id !== id || product.data.version !== version + 1) {
      throw new Error('Respuesta de imagen inválida. Recarga el catálogo.')
    }
    return product.data
  } catch (error) {
    if (controller.signal.aborted) throw new Error('La subida tardó demasiado. Recarga el catálogo para comprobar si la foto se guardó.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
