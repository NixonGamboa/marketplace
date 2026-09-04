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
    it('AC-2: recalcula total con `kilosReal * priceAtMoment` para variables (ADR-006)', async () => {
      seedOrders([baseOrder()])
      const updated = await mockOrderRepository.setRealWeights(
        'MAUI-1',
        [{ itemId: 'queso', kilos: 0.75 }],
        'operator@x',
      )
      // 2 x 4500 (leche fija) + 0.75 x 32000 (queso variable) = 9000 + 24000
      expect(updated.estimatedTotal).toBe(33000)
      const queso = updated.items.find((i) => i.id === 'queso')
      expect(queso?.kilosReal).toBe(0.75)
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
