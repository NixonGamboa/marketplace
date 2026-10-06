import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildOrderReceipt, customerReceiptFrom, describeTimeSlot, processingNoticeMessage, staffReceiptFrom } from '@shared/receipts'
import { orderDtoSchema } from '@shared/contracts'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T02:00:00Z')) })
afterEach(() => vi.useRealTimers())

const order = orderDtoSchema.parse({
  orderId: 'pedido-14', userId: 'cliente-14', status: 'preparing',
  items: [{ id: 'papa', name: 'Papa & limón', qty: 1, priceAtMoment: 3500, is_variable_weight: true, kilosRequested: 1.2 }],
  deliveryType: 'delivery', deliveryData: { address: 'Dirección privada' }, substitutionPreference: 'similar',
  customerName: 'Cliente privado', customerPhone: '573015550101', shippingCost: 2000,
  estimatedTotal: 6200, createdAt: '2026-10-02T02:30:00.000Z',
})
describe('comprobante compartido real', () => {
  it('preserva estimado y no inventa final ni peso real', () => {
    const receipt = buildOrderReceipt(order)
    expect(receipt.finalTotal).toBeUndefined()
    expect(receipt.text).toContain('peso real pendiente')
    expect(receipt.text).toContain('1/10/2026')
    expect(receipt.text).toContain('Subtotal estimado original')
    expect(receipt.text).not.toContain(order.customerName)
    expect(receipt.text).not.toContain(order.deliveryData.address)
  })
  it('conserva original con sustitución y retiro y muestra final del servidor', () => {
    const adjusted = { ...order, originalItems: [...order.items, { id: 'arroz', qty: 2, priceAtMoment: 1000 }],
      items: [{ id: 'limon', name: 'Limón', qty: 1, priceAtMoment: 4000, is_variable_weight: true,
        kilosRequested: 1.2, kilosReal: 1.125, substitutedFor: 'papa' }], finalTotal: 6500 }
    const receipt = buildOrderReceipt(adjusted)
    expect(receipt.originalLines).toHaveLength(2)
    expect(receipt.currentLines).toHaveLength(1)
    expect(receipt.currentLines[0].amount).toBe(4500)
    expect(receipt.text).toContain('producto sustituto')
    expect(receipt.text).toContain('1,125 kg reales')
    expect(receipt.finalTotal).toBe(6500)
    expect(receipt.estimatedTotal).toBe(6200)
  })
  it('no presume envío ni unidad legacy y distingue cancelación/recogida', () => {
    const receipt = buildOrderReceipt({ ...order, items: [{ id: 'legacy', qty: 2, priceAtMoment: 1000 }],
      deliveryType: 'pickup', deliveryData: {}, shippingCost: undefined, status: 'cancelled', finalTotal: 2000,
      cancellationReason: 'Cliente canceló', cancelledAt: '2026-10-02T03:00:00Z' })
    expect(receipt.text).toContain('Envío: no registrado')
    expect(receipt.text).toContain('unidad no registrada')
    expect(receipt.text).toContain('registrado antes de cancelar')
    expect(receipt.text).toContain('Recogida en tienda')
    expect(receipt.text).not.toContain('Subtotal final:')
  })
  it('usa destinos distintos y codifica el texto completo sin dirección/teléfono', () => {
    const pwa = customerReceiptFrom(order, { contactPhone: '+57 (310) 555-0102' })
    const admin = staffReceiptFrom(order)
    expect(new URL(pwa.contact!.url).pathname).toBe('/573105550102')
    expect(new URL(admin.contact!.url).pathname).toBe('/573015550101')
    expect(new URL(pwa.contact!.url).searchParams.get('text')).toContain(pwa.receipt.text)
    expect(pwa.contact!.url).toContain('%26')
  })
  it.each([null, '', '573000000000', 'abc3105550102', '12345'])('oculta contacto inválido %s sin ocultar comprobante', (contactPhone) => {
    const result = customerReceiptFrom(order, { contactPhone })
    expect(result.contact).toBeNull()
    expect(result.receipt.orderId).toBe(order.orderId)
  })
  it('admin legacy sin celular conserva seguimiento', () => {
    expect(staffReceiptFrom({ ...order, customerPhone: undefined }).contact).toBeNull()
  })
})

describe('franja de recogida con fecha autoritativa (PM-03)', () => {
  const pickup = { ...order, deliveryType: 'pickup' as const, deliveryData: { timeSlot: 'morning' as const }, shippingCost: 0, status: 'received' as const }

  it('describe la franja con la fecha del servidor, sin «hoy»/«mañana» relativos', () => {
    expect(describeTimeSlot('morning', '2026-10-07')).toBe('por la mañana · miércoles, 7 de octubre')
    expect(describeTimeSlot('afternoon', '2026-10-31')).toBe('por la tarde · sábado, 31 de octubre')
    expect(describeTimeSlot('asap', '2026-11-01')).toBe('lo antes posible · domingo, 1 de noviembre')
    expect(describeTimeSlot('morning')).toBe('por la mañana')
  })

  it('el comprobante muestra la franja y su fecha, separada del aviso de procesamiento', () => {
    const receipt = buildOrderReceipt({ ...pickup, timeSlotDate: '2026-10-07', processingNotice: { kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-06T19:00:00.000Z' } })
    expect(receipt.rows).toContain('Franja de recogida: por la mañana · miércoles, 7 de octubre')
    expect(receipt.rows).toContain(processingNoticeMessage({ kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-06T19:00:00.000Z' }))
    expect(receipt.text).toContain('mañana a primera hora, desde las 2 p. m.') // apertura (procesamiento), no la franja
  })

  it('la franja y su fecha siguen en el comprobante tras avanzar el estado; sin fecha solo la franja', () => {
    expect(buildOrderReceipt({ ...pickup, status: 'preparing', timeSlotDate: '2026-10-07' }).text).toContain('Franja de recogida: por la mañana · miércoles, 7 de octubre')
    expect(buildOrderReceipt(pickup).text).toContain('Franja de recogida: por la mañana')
    expect(buildOrderReceipt(pickup).text).not.toContain('·')
    expect(buildOrderReceipt({ ...order, deliveryType: 'pickup', deliveryData: {}, shippingCost: 0 }).text).not.toContain('Franja de recogida')
  })
})
