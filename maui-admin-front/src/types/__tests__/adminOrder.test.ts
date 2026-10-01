import { describe, expect, it } from 'vitest'
import type { AdminOrder } from '../adminOrder'
import { isCancelled, isTerminal } from '../adminOrder'

const order = (patch: Partial<AdminOrder> = {}): AdminOrder => ({
  orderId: 'MAUI-1',
  userId: 'u1',
  status: 'received',
  items: [{ id: 'leche', qty: 1, priceAtMoment: 4500 }],
  deliveryType: 'pickup',
  deliveryData: {},
  substitutionPreference: 'call_me',
  customerName: 'Ana',
  estimatedTotal: 4500,
  createdAt: '2026-09-29T12:00:00.000Z',
  ...patch,
})

describe('isCancelled / isTerminal', () => {
  it('reconoce el estado canónico cancelled', () => {
    expect(isCancelled(order({ status: 'cancelled' }))).toBe(true)
  })

  it('reconoce el legacy cancellationReason sobre otro estado', () => {
    expect(isCancelled(order({ status: 'preparing', cancellationReason: 'sin stock' }))).toBe(true)
  })

  it('no marca como cancelados los estados activos ni en camino', () => {
    for (const status of ['received', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered'] as const) {
      expect(isCancelled(order({ status }))).toBe(false)
    }
  })

  it('terminales: entregado y cancelado', () => {
    expect(isTerminal(order({ status: 'delivered' }))).toBe(true)
    expect(isTerminal(order({ status: 'cancelled' }))).toBe(true)
    expect(isTerminal(order({ status: 'in_delivery' }))).toBe(false)
  })
})
