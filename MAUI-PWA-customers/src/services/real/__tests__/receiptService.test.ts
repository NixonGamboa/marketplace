import { describe, expect, it } from 'vitest'
import { createRealReceiptService } from '../../realReceiptService'
import { clientWith, json, orderDto, storeDto, apiProblem, requestAt } from './fixtures'
describe('comprobante PWA por HTTP real', () => {
  it('valida pedido y tienda y usa contacto persistido', async () => {
    const { client, fetchImpl } = clientWith(json(orderDto()), json(storeDto({ contactPhone: '573105550102' })))
    const result = await createRealReceiptService(client).load('ord-1')
    expect(requestAt(fetchImpl, 0).url).toBe('/api/orders/ord-1')
    expect(requestAt(fetchImpl, 1).url).toBe('/api/store')
    expect(result.contact?.url).toContain('wa.me/573105550102?text=')
  })
  it('no consulta tienda cuando detalle no está autorizado', async () => {
    const { client, fetchImpl } = clientWith(apiProblem(403, 'FORBIDDEN', 'Sin permiso'))
    await expect(createRealReceiptService(client).load('ord-1')).rejects.toMatchObject({ status: 403 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('fallo de tienda deja comprobante sin enlace ni respaldo local', async () => {
    const { client } = clientWith(json(orderDto()), apiProblem(503, 'INTERNAL_ERROR', 'No disponible'))
    const result = await createRealReceiptService(client).load('ord-1')
    expect(result.receipt.orderId).toBe(orderDto().orderId)
    expect(result.contact).toBeNull()
    expect(result.contactUnavailable).toBeDefined()
  })
})
