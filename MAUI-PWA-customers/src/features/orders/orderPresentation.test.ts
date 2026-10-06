import { describe, expect, it } from 'vitest'
import { buildOrderReceipt, customerReceiptFrom, orderReferenceLabel, processingNoticeMessage } from '@shared/receipts'
import { orderDto } from '@/services/real/__tests__/fixtures'

describe('ME-02 reloj de Bogotá sobre apertura persistida', () => {
  it.each([
    ['21 h, apertura siguiente día', '2026-10-06T02:00:00Z', '2026-10-06T13:00:00Z', 'mañana a primera hora, desde las 8 a. m.'],
    ['01 h, apertura mismo día', '2026-10-06T06:00:00Z', '2026-10-06T13:00:00Z', 'hoy desde las 8 a. m.'],
    ['23:59 leído 00:01', '2026-10-06T05:01:00Z', '2026-10-06T13:00:00Z', 'hoy desde las 8 a. m.'],
    ['sábado a lunes', '2026-10-04T02:00:00Z', '2026-10-05T13:00:00Z', 'en nuestro próximo horario de atención'],
  ])('%s', (_case, now, startsAt, expected) => {
    const notice = Object.freeze({ kind: 'scheduled' as const, reason: 'after_closing' as const, startsAt })
    const message = processingNoticeMessage(notice, 'received', new Date(now))
    expect(message).toContain(expected)
    expect(message).not.toMatch(/lunes|martes|miércoles|jueves|viernes|sábado|domingo|octubre|2026/)
    expect(notice.startsAt).toBe(startsAt)
  })
  it('cierre manual sin hora fiable', () => {
    expect(processingNoticeMessage({ kind: 'unscheduled', reason: 'override_closed' }, 'received', new Date('2026-10-06T05:01:00Z'))).toContain('en nuestro próximo horario de atención')
  })
  it('apertura vencida aún recibido y estado confirmado', () => {
    const notice = { kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-06T13:00:00Z' } as const
    expect(processingNoticeMessage(notice, 'received', new Date('2026-10-06T14:00:00Z'))).toBe('Tu pedido está pendiente de preparación. Puedes consultar aquí su estado.')
    expect(processingNoticeMessage(notice, 'confirmed', new Date('2026-10-06T14:00:00Z'))).toBe('Confirmado')
  })
})

describe('ME-04 referencia y pago compartidos', () => {
  it('comprobante y WhatsApp conservan referencia comercial sin IDs técnicos', () => {
    const order = orderDto({ reference: 1248, paymentMethod: 'bre_b', items: [{ id: 'uuid-producto', qty: 1, priceAtMoment: 5000, substitutedFor: 'uuid-original' }] })
    const result = customerReceiptFrom(order, { contactPhone: '573105550101' })
    expect(result.receipt.rows).toContain('Pedido #001248')
    expect(result.receipt.rows).toContain('Pago: Transferencia Bre-B')
    const text = new URL(result.contact!.url).searchParams.get('text')!
    expect(text).toContain('Pedido #001248')
    for (const id of [order.orderId, 'uuid-producto', 'uuid-original']) expect(text).not.toContain(id)
    expect(result.receipt.orderId).toBe(order.orderId)
  })
  it('no fabrica referencia para demo y no trunca cifras grandes', () => {
    expect(orderReferenceLabel({})).toBe('Pedido')
    expect(orderReferenceLabel({ reference: 1000000 })).toBe('Pedido #1000000')
    expect(buildOrderReceipt(orderDto()).rows).toContain('Pago: Efectivo')
  })
})
