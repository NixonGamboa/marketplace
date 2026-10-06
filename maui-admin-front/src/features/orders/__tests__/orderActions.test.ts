/** Acciones por estado (ME-03): una principal, etiquetas por modalidad, sin retrocesos ni cancelar en camino. */
import { describe, expect, it } from 'vitest'
import type { AdminOrder } from '@/types/adminOrder'
import type { OrderStatus } from '@/types/orderService'
import { canCancelOrder, canReopenOrder, directDeliveryAction, primaryAction } from '../orderActions'

const order = (status: OrderStatus, deliveryType: 'pickup' | 'delivery' = 'pickup', overrides: Partial<AdminOrder> = {}): AdminOrder => ({
  orderId: 'ord-1', userId: 'usr', status, version: 2, items: [{ id: 'p', qty: 1, priceAtMoment: 1000 }], deliveryType,
  deliveryData: deliveryType === 'delivery' ? { address: 'Calle 1' } : {}, substitutionPreference: 'similar',
  customerName: 'Ana', estimatedTotal: 1000, createdAt: '2026-10-02T15:00:00.000Z', ...overrides,
})

describe('primaryAction', () => {
  it.each([
    ['received', 'pickup', 'Confirmar pedido', 'confirmed', undefined],
    ['confirmed', 'pickup', 'Comenzar preparación', 'preparing', undefined],
    ['preparing', 'pickup', 'Marcar como listo', 'ready', 'ready'],
    ['ready', 'delivery', 'Salió a domicilio', 'in_delivery', undefined],
    ['ready', 'pickup', 'Cliente recogió', 'delivered', 'handover'],
    ['in_delivery', 'delivery', 'Confirmar entrega', 'delivered', 'handover'],
  ] as const)('%s (%s): «%s»', (status, delivery, label, target, confirmation) => {
    expect(primaryAction(order(status, delivery))).toEqual({ status: target, label, ...(confirmation ? { confirmation } : {}) })
  })

  it('confirmar y comenzar no piden confirmación adicional; listo y entrega, una', () => {
    expect(primaryAction(order('received'))?.confirmation).toBeUndefined()
    expect(primaryAction(order('confirmed'))?.confirmation).toBeUndefined()
    expect(primaryAction(order('preparing'))?.confirmation).toBe('ready')
  })

  it('entregado y cancelado no tienen acción', () => {
    expect(primaryAction(order('delivered'))).toBeNull()
    expect(primaryAction(order('cancelled'))).toBeNull()
    expect(primaryAction(order('preparing', 'pickup', { cancellationReason: 'Sin stock' }))).toBeNull()
  })
})

describe('acciones secundarias y cancelación', () => {
  it('la entrega directa solo existe en un domicilio listo', () => {
    expect(directDeliveryAction(order('ready', 'delivery'))).toEqual({ status: 'delivered', label: 'Entrega directa', confirmation: 'handover' })
    expect(directDeliveryAction(order('ready', 'pickup'))).toBeNull()
    expect(directDeliveryAction(order('in_delivery', 'delivery'))).toBeNull()
  })

  it('se cancela hasta «listo»; en camino y los estados finales no', () => {
    for (const status of ['received', 'confirmed', 'preparing', 'ready'] as const) expect(canCancelOrder(order(status))).toBe(true)
    for (const status of ['in_delivery', 'delivered', 'cancelled'] as const) expect(canCancelOrder(order(status, 'delivery'))).toBe(false)
  })

  it('reabrir solo desde «listo» y para personal autorizado', () => {
    expect(canReopenOrder(order('ready'), 'operator')).toBe(true)
    expect(canReopenOrder(order('ready'), 'owner')).toBe(true)
    expect(canReopenOrder(order('ready'), 'customer')).toBe(false)
    expect(canReopenOrder(order('ready'), undefined)).toBe(false)
    for (const status of ['received', 'confirmed', 'preparing', 'in_delivery', 'delivered', 'cancelled'] as const) {
      expect(canReopenOrder(order(status, 'delivery'), 'owner')).toBe(false)
    }
  })
})
