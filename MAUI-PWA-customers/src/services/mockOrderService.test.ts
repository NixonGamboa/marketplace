import { beforeEach, describe, expect, it } from 'vitest'
import type { OrderPayload } from '@/types/orderService'
import { mapCartItemsToOrderItems } from '@/features/checkout/checkoutStore'
import { mockOrderService } from './mockOrderService'

const payload: OrderPayload = {
  userId: 'u1',
  items: [
    { id: 'leche', qty: 2, priceAtMoment: 4500 },
    { id: 'queso', qty: 1, priceAtMoment: 32000, is_variable_weight: true, kilosRequested: 0.5 },
  ],
  substitutionPreference: 'similar',
  deliveryType: 'delivery',
  deliveryData: { address: 'Casa azul', lat: 3.54, lng: -74.89 },
  customerName: 'Ana',
  customerPhone: '+57 300 123 4567',
  shippingCost: 3000,
}

beforeEach(() => window.localStorage.clear())

describe('mockOrderService', () => {
  it('guarda teléfono, ubicación, referencia y total estimado por kilos solicitados', async () => {
    const confirmation = await mockOrderService.submit(payload)
    expect(confirmation.estimatedTotal).toBe(28000)

    const stored = await mockOrderService.getById(confirmation.orderId)
    expect(stored.customerPhone).toBe('573001234567')
    expect(stored.deliveryData).toEqual(payload.deliveryData)
    expect(stored.items[1]).toMatchObject({ qty: 1, is_variable_weight: true, kilosRequested: 0.5, priceAtMoment: 32000 })
    expect(stored.shippingCost).toBe(3000)
    expect(stored.estimatedTotal).toBe(28000)
    expect(stored.finalTotal).toBeUndefined()
  })

  it('lee pedidos anteriores sin teléfono ni total final', async () => {
    window.localStorage.setItem('maui-orders', JSON.stringify({ legacy: {
      orderId: 'legacy', userId: 'u1', status: 'received', items: [],
      deliveryType: 'pickup', deliveryData: {}, substitutionPreference: 'similar',
      customerName: 'Ana', estimatedTotal: 12000, createdAt: '2026-01-01T00:00:00Z',
    } }))
    const order = await mockOrderService.getById('legacy')
    expect(order.customerPhone).toBeUndefined()
    expect(order.shippingCost).toBeUndefined()
    expect(order.finalTotal).toBeUndefined()
    expect(order.estimatedTotal).toBe(12000)
  })

  it('rechaza celular inválido y kilos ausentes antes de persistir', async () => {
    await expect(mockOrderService.submit({ ...payload, customerPhone: '123' }))
      .rejects.toThrow(/celular/i)
    await expect(mockOrderService.submit({ ...payload, items: [
      { id: 'queso', qty: 1, priceAtMoment: 32000, is_variable_weight: true },
    ] })).rejects.toThrow(/cantidad/i)
    expect(window.localStorage.getItem('maui-orders')).toBeNull()
  })

  it('acepta retiro sin envío y rechaza costos de envío inválidos', async () => {
    const pickup = await mockOrderService.submit({
      ...payload,
      deliveryType: 'pickup',
      deliveryData: {},
      shippingCost: 0,
    })
    expect(pickup.estimatedTotal).toBe(25000)
    expect((await mockOrderService.getById(pickup.orderId)).shippingCost).toBe(0)

    await expect(mockOrderService.submit({ ...payload, shippingCost: -1 }))
      .rejects.toThrow(/costo de envío/i)
    await expect(mockOrderService.submit({ ...payload, shippingCost: Number.NaN }))
      .rejects.toThrow(/costo de envío/i)
  })

  it('un carrito mixto conserva cada precio snapshot y calcula el estimado del checkout', async () => {
    const items = mapCartItemsToOrderItems([
      {
        productId: 'queso', name: 'Queso', imageUrl: '', price: 32000,
        price_at_moment: 30000, unit: 'kg', quantity: 1,
        is_variable_weight: true, kilos: 0.75,
      },
      {
        productId: 'pan', name: 'Pan', imageUrl: '', price: 6000,
        price_at_moment: 5000, unit: 'und', quantity: 2,
        is_variable_weight: false,
      },
    ])
    const confirmation = await mockOrderService.submit({ ...payload, items, shippingCost: 2500 })
    // 0.75 kg x 30.000 + 2 x 5.000 + 2.500 de envío
    expect(confirmation.estimatedTotal).toBe(35000)

    const stored = await mockOrderService.getById(confirmation.orderId)
    expect(stored.items).toEqual(items)
    expect(stored.finalTotal).toBeUndefined()
  })
})
