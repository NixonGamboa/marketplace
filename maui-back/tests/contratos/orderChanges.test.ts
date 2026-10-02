import { describe, expect, it } from 'vitest'
import {
  ITEMS_EDITABLE_STATUS,
  ORDER_STATUS_VALUES,
  isTerminalOrderStatus,
  orderDtoSchema,
  updateOrderItemsRequestSchema,
  updateOrderStatusRequestSchema,
} from '../../../shared/contracts/index.js'
import { toOrderDto } from '../../src/domain/orders/orderMappers.js'
import { internalOrder } from './fixtures.js'

const statusIssues = (input: unknown): string[] => {
  const result = updateOrderStatusRequestSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

const itemIssues = (input: unknown): string[] => {
  const result = updateOrderItemsRequestSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

const weight = (itemId = 'prod_carne', kilosReal: unknown = 1.234) => ({ type: 'weight', itemId, kilosReal })

describe('vocabulario T-12', () => {
  it('solo entregado y cancelado son terminales; los ítems se editan en preparación', () => {
    expect(ORDER_STATUS_VALUES.filter(isTerminalOrderStatus)).toEqual(['delivered', 'cancelled'])
    expect(ITEMS_EDITABLE_STATUS).toBe('preparing')
  })
})

describe('updateOrderStatusRequestSchema', () => {
  it('exige versión entera positiva y estado del vocabulario común', () => {
    expect(statusIssues({ status: 'confirmed', expectedVersion: 1 })).toEqual([])
    for (const expectedVersion of [undefined, 0, -1, 1.5, '1', 2 ** 31]) {
      expect(statusIssues({ status: 'confirmed', expectedVersion })).toContain('expectedVersion')
    }
    expect(statusIssues({ status: 'shipped', expectedVersion: 1 })).toContain('status')
  })

  it('cancelar exige motivo recortado de 5–500 caracteres; otros destinos lo rechazan', () => {
    const parsed = updateOrderStatusRequestSchema.parse({ status: 'cancelled', expectedVersion: 3, reason: '  Cliente no contesta\nni responde  ' })
    expect(parsed.reason).toBe('Cliente no contesta\nni responde')
    expect(statusIssues({ status: 'cancelled', expectedVersion: 1 })).toEqual(['reason'])
    expect(statusIssues({ status: 'ready', expectedVersion: 1, reason: 'Motivo válido' })).toEqual(['reason'])
    for (const reason of ['    abc   ', 'x'.repeat(501), 'Motivo\u0000oculto', 'Motivo\u001bvalido', 42]) {
      expect(statusIssues({ status: 'cancelled', expectedVersion: 1, reason })).toContain('reason')
    }
  })

  it('strict: actor, tienda, totales o fechas del request se rechazan', () => {
    for (const extra of [{ by: 'acc_x' }, { storeId: 'otra' }, { finalTotal: 1 }, { cancelledAt: '2026-10-01T00:00:00.000Z' }]) {
      expect(statusIssues({ status: 'confirmed', expectedVersion: 1, ...extra })).toEqual([''])
    }
  })
})

describe('updateOrderItemsRequestSchema', () => {
  it('acepta pesos, retiro y sustitución en un mismo bloque', () => {
    expect(itemIssues({
      expectedVersion: 2,
      changes: [
        weight(),
        { type: 'remove', itemId: 'prod_pan' },
        { type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 },
        { type: 'substitute', itemId: 'prod_res', productId: 'prod_pollo', qty: 1, kilosRequested: 1, kilosReal: 0.987 },
      ],
    })).toEqual([])
  })

  it('pesos en gramos dentro del rango técnico', () => {
    for (const kilos of [0, -1, 0.0005, 1.2345, 100.001, Number.NaN, '1.2']) {
      expect(itemIssues({ expectedVersion: 1, changes: [weight('prod_carne', kilos)] })).toContain('changes.0.kilosReal')
    }
    expect(itemIssues({ expectedVersion: 1, changes: [weight('prod_carne', 0.001)] })).toEqual([])
    expect(itemIssues({ expectedVersion: 1, changes: [weight('prod_carne', 100)] })).toEqual([])
  })

  it('rechaza ítems repetidos, sustitutos repetidos, lista vacía o excesiva', () => {
    expect(itemIssues({ expectedVersion: 1, changes: [weight(), { type: 'remove', itemId: 'prod_carne' }] })).toEqual(['changes.1.itemId'])
    expect(itemIssues({
      expectedVersion: 1,
      changes: [
        { type: 'substitute', itemId: 'a', productId: 'p', qty: 1 },
        { type: 'substitute', itemId: 'b', productId: 'p', qty: 1 },
      ],
    })).toEqual(['changes.1.productId'])
    expect(itemIssues({ expectedVersion: 1, changes: [] })).toEqual(['changes'])
    const many = Array.from({ length: 51 }, (_, index) => ({ type: 'remove', itemId: `prod_${index}` }))
    expect(itemIssues({ expectedVersion: 1, changes: many })).toEqual(['changes'])
  })

  it('customerContacted solo admite `true` y solo en retiro o sustitución', () => {
    const substitute = { type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }
    expect(itemIssues({ expectedVersion: 1, changes: [{ ...substitute, customerContacted: true }] })).toEqual([])
    expect(itemIssues({ expectedVersion: 1, changes: [{ type: 'remove', itemId: 'prod_leche', customerContacted: true }] })).toEqual([])
    for (const customerContacted of [false, 'sí', 1, null]) {
      expect(itemIssues({ expectedVersion: 1, changes: [{ ...substitute, customerContacted }] })).toEqual(['changes.0.customerContacted'])
    }
    expect(itemIssues({ expectedVersion: 1, changes: [{ ...weight(), customerContacted: true }] })).toEqual(['changes.0'])
  })

  it('strict: precio, nombre o unidad del sustituto y tipos desconocidos se rechazan', () => {
    const substitute = { type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 }
    for (const extra of [{ priceAtMoment: 1 }, { name: 'Queso' }, { unit: '1 kg' }, { is_variable_weight: true }]) {
      expect(itemIssues({ expectedVersion: 1, changes: [{ ...substitute, ...extra }] })).toEqual(['changes.0'])
    }
    expect(itemIssues({ expectedVersion: 1, changes: [{ type: 'discount', itemId: 'prod_leche' }] })).toEqual(['changes.0.type'])
    expect(itemIssues({ expectedVersion: 1, changes: [{ ...substitute, qty: 0 }] })).toEqual(['changes.0.qty'])
    expect(itemIssues({ changes: [weight()] })).toEqual(['expectedVersion'])
    expect(itemIssues({ expectedVersion: 1, changes: [weight()], storeId: 'otra' })).toEqual([''])
  })
})

describe('orderDtoSchema con campos T-12', () => {
  const cancelled = internalOrder({
    status: 'cancelled',
    cancellationReason: 'Cliente canceló por teléfono',
    cancelledAt: '2026-09-03T11:00:00.000Z',
    version: 4,
  })

  it('expone versión, motivo, fecha y snapshot original; nunca el actor', () => {
    const dto = toOrderDto({ ...cancelled, updatedBy: 'acc_operador', originalItems: cancelled.items })
    expect(dto).toMatchObject({ version: 4, cancellationReason: 'Cliente canceló por teléfono', cancelledAt: '2026-09-03T11:00:00.000Z' })
    expect(dto.originalItems).toHaveLength(2)
    expect(dto).not.toHaveProperty('updatedBy')
  })

  it('motivo y fecha van juntos y solo en pedidos cancelados', () => {
    const dto = toOrderDto(cancelled)
    expect(orderDtoSchema.safeParse({ ...dto, status: 'ready' }).success).toBe(false)
    expect(orderDtoSchema.safeParse({ ...dto, cancelledAt: undefined }).success).toBe(false)
    expect(orderDtoSchema.safeParse({ ...dto, cancellationReason: undefined }).success).toBe(false)
    // Cancelación legacy (previa a T-12): sin motivo ni fecha sigue siendo válida.
    expect(orderDtoSchema.safeParse({ ...dto, cancellationReason: undefined, cancelledAt: undefined }).success).toBe(true)
  })

  it('una línea sustituta declara el producto original', () => {
    const dto = toOrderDto(internalOrder({
      items: [{ id: 'prod_queso', name: 'Queso', qty: 1, priceAtMoment: 9000, substitutedFor: 'prod_leche' }],
    }))
    expect(dto.items[0]).toMatchObject({ substitutedFor: 'prod_leche' })
    expect(orderDtoSchema.safeParse({ ...dto, items: [{ ...dto.items[0], substitutedFor: 'bad id' }] }).success).toBe(false)
  })
})
