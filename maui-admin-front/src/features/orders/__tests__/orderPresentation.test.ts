/** Textos de pedidos para el personal (ME-04): referencia en WhatsApp, nombres sin identificadores técnicos y antigüedad. */
import { describe, expect, it } from 'vitest'
import { ORDER_STATUS_LABELS, itemDisplayName, messageForStatus, orderAgeLabel } from '../orderPresentation'

describe('messageForStatus', () => {
  it.each(Object.keys(ORDER_STATUS_LABELS) as Array<keyof typeof ORDER_STATUS_LABELS>)('«%s» abre con la referencia comercial', (status) => {
    expect(messageForStatus(status, 'Pedido #001248').startsWith('Pedido #001248: ')).toBe(true)
  })
})

describe('itemDisplayName', () => {
  it('prefiere el nombre del pedido, luego el del catálogo y nunca muestra el identificador', () => {
    expect(itemDisplayName({ id: 'prod-uuid', name: 'Leche' }, { 'prod-uuid': 'Otro' })).toBe('Leche')
    expect(itemDisplayName({ id: 'prod-uuid' }, { 'prod-uuid': 'Leche entera' })).toBe('Leche entera')
    expect(itemDisplayName({ id: 'prod-uuid' })).toBe('Producto')
  })
})

describe('orderAgeLabel', () => {
  const now = new Date('2026-10-06T12:00:00Z')
  it.each([
    ['2026-10-06T11:59:45Z', 'Hace un momento'],
    ['2026-10-06T11:59:00Z', 'Hace 1 minuto'],
    ['2026-10-06T11:15:00Z', 'Hace 45 minutos'],
    ['2026-10-06T11:00:00Z', 'Hace 1 hora'],
    ['2026-10-06T07:00:00Z', 'Hace 5 horas'],
    ['2026-10-05T11:00:00Z', 'Hace 1 día'],
    ['2026-10-01T12:00:00Z', 'Hace 5 días'],
  ])('%s → %s', (createdAt, expected) => {
    expect(orderAgeLabel(createdAt, now)).toBe(expected)
  })
})
