import { describe, expect, it } from 'vitest'
import { createRealReceiptService } from '../../realReceiptService'
import { clientWith, json, orderDto, apiProblem, requestAt } from './fixtures'
describe('comprobante admin por HTTP real', () => {
  it('muestra la misma referencia comercial en el comprobante y en el texto de WhatsApp', async () => {
    const order = orderDto({ customerPhone: '573105550103', reference: 1248, paymentMethod: 'bre_b' })
    const { client } = clientWith(json(order))
    const result = await createRealReceiptService(client).load(order.orderId)
    expect(result.receipt.rows).toContain('Pedido #001248')
    expect(result.receipt.rows).toContain('Pago: Transferencia Bre-B')
    expect(decodeURIComponent(result.contact?.url ?? '')).toContain('Pedido #001248')
    expect(result.receipt.text).not.toContain(order.orderId)
  })
  it('usa celular del detalle autorizado y nunca de la tienda', async () => {
    const order = orderDto({ customerPhone: '573105550103' })
    const { client, fetchImpl } = clientWith(json(order))
    const result = await createRealReceiptService(client).load(order.orderId)
    expect(requestAt(fetchImpl).url).toBe(`/api/orders/${order.orderId}`)
    expect(requestAt(fetchImpl).headers).toMatchObject({ 'X-Maui-Contract': '2' })
    expect(result.contact?.url).toContain('wa.me/573105550103?text=')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('propaga permisos sin construir comprobante ni contacto', async () => {
    const { client } = clientWith(apiProblem(403, 'FORBIDDEN', 'Sin permiso'))
    await expect(createRealReceiptService(client).load('ord-1')).rejects.toMatchObject({ status: 403 })
  })
})
