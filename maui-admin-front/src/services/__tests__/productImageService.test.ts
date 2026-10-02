import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadProductImageFile } from '../productImageService'

const product = { id: 'p1', version: 2, name: 'Producto', price: 1000, unit: '1 u', imageUrl: 'https://store.public.blob.vercel-storage.com/test/p.webp',
  categoryId: 'cat', inStock: true, is_variable_weight: false, currency: 'COP', active: true, archived: false,
  createdAt: '2026-10-02T12:00:00.000Z', updatedAt: '2026-10-02T13:00:00.000Z' }
const file = () => new File(['bytes'], 'sin-confianza.jpg', { type: 'image/jpeg' })
afterEach(() => vi.unstubAllGlobals())
describe('servicio de imagen real', () => {
  it('envía solo bytes+versión con cookie y valida snapshot, sin token Blob ni nombre', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => product })
    vi.stubGlobal('fetch', fetch)
    expect(await uploadProductImageFile('p1', 1, file())).toEqual(product)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('/api/catalog/products/p1/image?version=1')
    expect(init.credentials).toBe('same-origin')
    expect(JSON.parse(init.body)).toEqual({ imageBase64: 'Ynl0ZXM=' })
    expect(init.body).not.toMatch(/sin-confianza|token|storeId/)
  })
  it.each([401, 403, 404, 409, 429, 503])('informa status %s sin fingir subida', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }))
    await expect(uploadProductImageFile('p1', 1, file())).rejects.toThrow()
  })
  it('rechaza archivo grande antes de red y response de otro producto', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...product, id: 'otra' }) })
    vi.stubGlobal('fetch', fetch)
    await expect(uploadProductImageFile('p1', 1, new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'x.jpg'))).rejects.toThrow('3 MiB')
    expect(fetch).not.toHaveBeenCalled()
    await expect(uploadProductImageFile('p1', 1, file())).rejects.toThrow('Respuesta de imagen inválida')
  })
})
