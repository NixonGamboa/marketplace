/**
 * @spec TASK-006, ADR-006, RN-6
 * Cobertura de list/setRealWeights/updateStatus/cancel y guards.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { AdminOrder } from '@/types/adminOrder'
import { mockOrderRepository } from '../mockOrderRepository'
import { _clearAuditLog, mockAuditRepository } from '../mockAuditRepository'

function seedOrders(orders: AdminOrder[]) {
  const byId = Object.fromEntries(orders.map((o) => [o.orderId, o]))
  window.localStorage.setItem('maui-orders', JSON.stringify(byId))
}

function baseOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    orderId: 'MAUI-1',
    userId: 'u1',
    status: 'received',
    items: [
      { id: 'leche-1l', qty: 2, priceAtMoment: 4500 },
      { id: 'queso', qty: 1, priceAtMoment: 32000, is_variable_weight: true, kilosRequested: 0.5 },
    ],
    deliveryType: 'pickup',
    deliveryData: {},
    substitutionPreference: 'similar',
    customerName: 'Juan',
    estimatedTotal: 9000 + 16000, // qty*price para 2L + kilosRequested*price para 0.5kg
    createdAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  _clearAuditLog()
})

describe('mockOrderRepository', () => {
  describe('list', () => {
    it('AC-1: retorna ordenado por createdAt desc', async () => {
      seedOrders([
        baseOrder({ orderId: 'A', createdAt: '2026-06-01T10:00:00Z' }),
        baseOrder({ orderId: 'B', createdAt: '2026-06-02T10:00:00Z' }),
        baseOrder({ orderId: 'C', createdAt: '2026-05-30T10:00:00Z' }),
      ])
      const list = await mockOrderRepository.list()
      expect(list.map((o) => o.orderId)).toEqual(['B', 'A', 'C'])
    })

    it('AC-1: filtra por status', async () => {
      seedOrders([
        baseOrder({ orderId: 'A', status: 'received' }),
        baseOrder({ orderId: 'B', status: 'delivered' }),
      ])
      const list = await mockOrderRepository.list({ status: 'delivered' })
      expect(list.map((o) => o.orderId)).toEqual(['B'])
    })
  })

  describe('setRealWeights', () => {
    it('conserva el estimado y guarda el total final con el peso real', async () => {
      seedOrders([baseOrder()])
      const updated = await mockOrderRepository.setRealWeights(
        'MAUI-1',
        [{ itemId: 'queso', kilos: 0.75 }],
        'operator@x',
      )
      // 2 x 4500 (leche fija) + 0.75 x 32000 (queso variable) = 9000 + 24000
      expect(updated.estimatedTotal).toBe(25000)
      expect(updated.finalTotal).toBe(33000)
      const queso = updated.items.find((i) => i.id === 'queso')
      expect(queso?.kilosReal).toBe(0.75)
      expect((await mockOrderRepository.getById('MAUI-1')).finalTotal).toBe(33000)
    })

    it('suma el envío snapshot al total final sin alterar el estimado', async () => {
      seedOrders([baseOrder({ deliveryType: 'delivery', shippingCost: 3000, estimatedTotal: 28000 })])
      const updated = await mockOrderRepository.setRealWeights(
        'MAUI-1', [{ itemId: 'queso', kilos: 0.75 }], 'operator@x',
      )
      expect(updated.shippingCost).toBe(3000)
      expect(updated.estimatedTotal).toBe(28000)
      expect(updated.finalTotal).toBe(36000)
    })

    it('no fija total final hasta pesar todos los productos variables', async () => {
      seedOrders([baseOrder({ items: [
        { id: 'queso', qty: 1, priceAtMoment: 32000, is_variable_weight: true, kilosRequested: 0.5 },
        { id: 'carne', qty: 1, priceAtMoment: 20000, is_variable_weight: true, kilosRequested: 1 },
      ], estimatedTotal: 36000 })])
      const partial = await mockOrderRepository.setRealWeights('MAUI-1', [{ itemId: 'queso', kilos: 0.75 }], 'x')
      expect(partial.estimatedTotal).toBe(36000)
      expect(partial.finalTotal).toBeUndefined()
      const complete = await mockOrderRepository.setRealWeights('MAUI-1', [{ itemId: 'carne', kilos: 1.1 }], 'x')
      expect(complete.finalTotal).toBe(46000)
    })

    it('rechaza pesos reales no positivos o no finitos', async () => {
      seedOrders([baseOrder()])
      await expect(mockOrderRepository.setRealWeights('MAUI-1', [{ itemId: 'queso', kilos: 0 }], 'x'))
        .rejects.toThrow(/peso real/i)
      await expect(mockOrderRepository.setRealWeights('MAUI-1', [{ itemId: 'queso', kilos: Number.NaN }], 'x'))
        .rejects.toThrow(/peso real/i)
    })

    it('registra audit con action order.weights_set', async () => {
      seedOrders([baseOrder()])
      await mockOrderRepository.setRealWeights(
        'MAUI-1',
        [{ itemId: 'queso', kilos: 1 }],
        'operator@x',
      )
      const events = await mockAuditRepository.list()
      expect(events[0].action).toBe('order.weights_set')
      expect(events[0].user).toBe('operator@x')
    })
  })

  describe('cancel', () => {
    it('AC-3: throw si reason vacío', async () => {
      seedOrders([baseOrder()])
      await expect(mockOrderRepository.cancel('MAUI-1', '', 'x')).rejects.toThrow(/motivo/i)
      await expect(mockOrderRepository.cancel('MAUI-1', '   ', 'x')).rejects.toThrow(/motivo/i)
    })

    it('registra cancellationReason + cancelledAt + audit', async () => {
      seedOrders([baseOrder()])
      const cancelled = await mockOrderRepository.cancel(
        'MAUI-1',
        'Cliente no contestó',
        'operator@x',
      )
      expect(cancelled.cancellationReason).toBe('Cliente no contestó')
      expect(cancelled.cancelledAt).toBeTruthy()

      const events = await mockAuditRepository.list()
      expect(events[0].action).toBe('order.cancelled')
    })

    it('throw si ya estaba cancelado (RN-6)', async () => {
      seedOrders([baseOrder({ cancellationReason: 'previo', cancelledAt: '2026-06-01T00:00:00Z' })])
      await expect(mockOrderRepository.cancel('MAUI-1', 'otro', 'x')).rejects.toThrow(/cancelado/i)
    })
  })

  describe('updateStatus', () => {
    it('no permite marcar listo un pedido con pesos variables pendientes', async () => {
      seedOrders([baseOrder({ status: 'preparing' })])
      await expect(mockOrderRepository.updateStatus('MAUI-1', 'ready', 'x'))
        .rejects.toThrow(/pesos reales/i)
      await mockOrderRepository.setRealWeights('MAUI-1', [{ itemId: 'queso', kilos: 0.75 }], 'x')
      expect((await mockOrderRepository.updateStatus('MAUI-1', 'ready', 'x')).status).toBe('ready')
    })

    it('bloquea mutación en pedidos cancelados (RN-6)', async () => {
      seedOrders([baseOrder({ cancellationReason: 'cancelado' })])
      await expect(
        mockOrderRepository.updateStatus('MAUI-1', 'confirmed', 'x'),
      ).rejects.toThrow(/cancelado/i)
    })

    it('bloquea mutación en pedidos entregados', async () => {
      seedOrders([baseOrder({ status: 'delivered' })])
      await expect(
        mockOrderRepository.updateStatus('MAUI-1', 'ready', 'x'),
      ).rejects.toThrow(/entregado/i)
    })

    it('registra audit al transicionar estado', async () => {
      seedOrders([baseOrder({ status: 'received' })])
      await mockOrderRepository.updateStatus('MAUI-1', 'confirmed', 'operator@x')
      const events = await mockAuditRepository.list()
      expect(events[0].action).toBe('order.status_changed')
      expect(events[0].meta).toMatchObject({ from: 'received', to: 'confirmed' })
    })
  })
})
