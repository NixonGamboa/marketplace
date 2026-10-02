import { describe, expect, it } from 'vitest'
import {
  createOrderRequestSchema,
  orderConfirmationSchema,
  orderDtoSchema,
} from '../../../shared/contracts/index.js'
import { validDeliveryRequest, validPickupRequest, variableWeightItem } from './fixtures.js'

const parse = (input: unknown) => createOrderRequestSchema.safeParse(input)

const issuePaths = (input: unknown): string[] => {
  const result = parse(input)
  if (result.success) return []
  return result.error.issues.map((issue) => issue.path.join('.'))
}

const withItem = (patch: Record<string, unknown>) => ({
  ...validPickupRequest(),
  items: [{ ...validPickupRequest().items[0], ...patch }],
})

describe('createOrderRequestSchema — casos válidos', () => {
  it('retiro con franja y teléfono normalizado a canónico', () => {
    const result = parse(validPickupRequest())
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.customerPhone).toBe('573001234567')
  })

  it('domicilio con dirección, GPS pareado y envío', () => {
    expect(parse(validDeliveryRequest()).success).toBe(true)
  })

  it('domicilio sin GPS ni franja', () => {
    const body = { ...validDeliveryRequest(), deliveryData: { address: 'Carrera 10 # 12-08' } }
    expect(parse(body).success).toBe(true)
  })

  it('domicilio con envío gratis (0)', () => {
    expect(parse({ ...validDeliveryRequest(), shippingCost: 0 }).success).toBe(true)
  })

  it('ítem de peso variable con kilos en gramos', () => {
    expect(parse({ ...validPickupRequest(), items: [variableWeightItem()] }).success).toBe(true)
  })

  it('acepta el payload mínimo del demo (sin name, sin is_variable_weight)', () => {
    const body = { ...validPickupRequest(), items: [{ id: 'arroz-1kg', qty: 1, priceAtMoment: 5500 }] }
    expect(parse(body).success).toBe(true)
  })
})

describe('createOrderRequestSchema — números', () => {
  it.each([
    ['qty 0', { qty: 0 }],
    ['qty negativa', { qty: -1 }],
    ['qty decimal', { qty: 1.5 }],
    ['qty sobre el tope', { qty: 100 }],
    ['qty NaN', { qty: Number.NaN }],
    ['qty Infinity', { qty: Number.POSITIVE_INFINITY }],
    ['qty string', { qty: '2' }],
    ['precio decimal', { priceAtMoment: 4500.5 }],
    ['precio negativo', { priceAtMoment: -1 }],
    ['precio NaN', { priceAtMoment: Number.NaN }],
    ['precio Infinity', { priceAtMoment: Number.POSITIVE_INFINITY }],
    ['precio sobre el tope', { priceAtMoment: 100_000_001 }],
  ])('rechaza %s', (_label, patch) => {
    expect(parse(withItem(patch)).success).toBe(false)
  })

  it.each([0, -1, 0.0005, 1.2345, 100.001, Number.NaN, Number.POSITIVE_INFINITY, '1.5'])(
    'rechaza kilosRequested %j',
    (kilos) => {
      const body = { ...validPickupRequest(), items: [{ ...variableWeightItem(), kilosRequested: kilos }] }
      expect(parse(body).success).toBe(false)
    },
  )

  it.each([-1, 1.5, 100_000_001, Number.NaN, Number.POSITIVE_INFINITY])('rechaza shippingCost %j', (cost) => {
    expect(parse({ ...validDeliveryRequest(), shippingCost: cost }).success).toBe(false)
  })

  it('rechaza más ítems que el tope y pedidos vacíos', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ id: `p${i}`, qty: 1, priceAtMoment: 1000 }))
    expect(parse({ ...validPickupRequest(), items: many }).success).toBe(false)
    expect(parse({ ...validPickupRequest(), items: [] }).success).toBe(false)
  })

  it('rechaza productos repetidos', () => {
    const item = { id: 'dup', qty: 1, priceAtMoment: 1000 }
    expect(issuePaths({ ...validPickupRequest(), items: [item, item] })).toContain('items.1.id')
  })
})

describe('createOrderRequestSchema — pesos solicitado/real', () => {
  it('la forma de peso se valida contra catálogo, nunca con el flag legacy', () => {
    expect(parse(withItem({ kilosRequested: 1, is_variable_weight: false })).success).toBe(true)
    expect(parse({ ...validPickupRequest(), items: [{ id: 'prod_carne', qty: 1, kilosRequested: 1 }] }).success).toBe(true)
  })

  it('el cliente no puede enviar el peso real (resultado del aliado)', () => {
    const body = { ...validPickupRequest(), items: [{ ...variableWeightItem(), kilosReal: 1.4 }] }
    expect(parse(body).success).toBe(false)
  })
})

describe('createOrderRequestSchema — entrega, GPS y retiro', () => {
  it('domicilio exige dirección/referencia o GPS', () => {
    expect(issuePaths({ ...validDeliveryRequest(), deliveryData: {} })).toContain('deliveryData')
    expect(issuePaths({ ...validDeliveryRequest(), deliveryData: { timeSlot: 'asap' } })).toContain('deliveryData')
    expect(parse({ ...validDeliveryRequest(), deliveryData: { address: '   ' } }).success).toBe(false)
  })

  it('domicilio solo con GPS (sin dirección) es válido', () => {
    const gpsOnly = { ...validDeliveryRequest(), deliveryData: { lat: 3.5402, lng: -74.8965 } }
    const result = parse(gpsOnly)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.deliveryData).toEqual({ lat: 3.5402, lng: -74.8965 })
  })

  it('domicilio solo con dirección (sin GPS) es válido', () => {
    expect(parse({ ...validDeliveryRequest(), deliveryData: { address: 'Vereda El Triunfo, casa azul' } }).success).toBe(true)
  })

  it.each([
    ['lat sin lng', { address: 'Calle 1', lat: 3.5 }],
    ['lng sin lat', { address: 'Calle 1', lng: -74.8 }],
    ['lat > 90', { address: 'Calle 1', lat: 91, lng: -74.8 }],
    ['lat < -90', { address: 'Calle 1', lat: -90.1, lng: -74.8 }],
    ['lng > 180', { address: 'Calle 1', lat: 3.5, lng: 181 }],
    ['lng < -180', { address: 'Calle 1', lat: 3.5, lng: -180.5 }],
    ['lat NaN', { address: 'Calle 1', lat: Number.NaN, lng: -74.8 }],
    ['lng Infinity', { address: 'Calle 1', lat: 3.5, lng: Number.POSITIVE_INFINITY }],
    ['franja desconocida', { address: 'Calle 1', timeSlot: 'night' }],
    ['campo extra', { address: 'Calle 1', floor: 3 }],
  ])('rechaza GPS/franja inválidos: %s', (_label, deliveryData) => {
    expect(parse({ ...validDeliveryRequest(), deliveryData }).success).toBe(false)
  })

  it('acepta GPS en los límites', () => {
    const deliveryData = { address: 'Calle 1', lat: -90, lng: 180 }
    expect(parse({ ...validDeliveryRequest(), deliveryData }).success).toBe(true)
  })

  it('retiro no lleva dirección, GPS ni envío', () => {
    const base = validPickupRequest()
    expect(parse({ ...base, deliveryData: { address: 'Calle 1' } }).success).toBe(false)
    expect(parse({ ...base, deliveryData: { lat: 3.5, lng: -74.8 } }).success).toBe(false)
    expect(parse({ ...base, shippingCost: 3000 }).success).toBe(true)
  })

  it.each(['night', 'MORNING', '', null])('rechaza franja %j', (timeSlot) => {
    expect(parse({ ...validPickupRequest(), deliveryData: { timeSlot } }).success).toBe(false)
  })
})

describe('createOrderRequestSchema — teléfono, sustitución y campos de autoridad', () => {
  it.each(['', '12345', '+1 3001234567', 'abc', 3001234567])('rechaza teléfono %j', (customerPhone) => {
    expect(parse({ ...validPickupRequest(), customerPhone }).success).toBe(false)
  })

  it('valores de sustitución únicos: call_me | similar | remove', () => {
    for (const ok of ['call_me', 'similar', 'remove']) {
      expect(parse({ ...validPickupRequest(), substitutionPreference: ok }).success).toBe(true)
    }
    for (const legacy of ['ask', 'allow', 'none', '']) {
      expect(parse({ ...validPickupRequest(), substitutionPreference: legacy }).success).toBe(false)
    }
  })

  it.each([
    ['status', 'delivered'],
    ['orderId', '01HJ0000000000000000000001'],
    ['id', '01HJ0000000000000000000001'],
    ['storeId', 'otra-tienda'],
    ['customerId', 'cust_99'],
    ['estimatedTotal', 1],
    ['finalTotal', 1],
    ['createdAt', '2026-09-03T10:00:00.000Z'],
    ['updatedAt', '2026-09-03T10:00:00.000Z'],
    ['deliveryMode', 'pickup'],
  ])('no acepta %s como autoridad del cliente', (field, value) => {
    expect(parse({ ...validPickupRequest(), [field]: value }).success).toBe(false)
  })

  it('rechaza nombre vacío y entradas no objeto', () => {
    expect(parse({ ...validPickupRequest(), customerName: '   ' }).success).toBe(false)
    for (const bad of [null, undefined, 'x', 1, []]) expect(parse(bad).success).toBe(false)
  })
})

describe('DTOs de respuesta', () => {
  const validDto = () => ({
    orderId: '01HJ0000000000000000000001',
    userId: 'cust_01',
    status: 'in_delivery',
    items: [{ id: 'prod_carne', qty: 1, priceAtMoment: 22000, is_variable_weight: true, kilosRequested: 1.5, kilosReal: 1.62 }],
    deliveryType: 'delivery',
    deliveryData: { address: 'Calle 8', lat: 3.5402, lng: -74.8965 },
    substitutionPreference: 'remove',
    customerName: 'Doña Carmen',
    customerPhone: '573001234567',
    shippingCost: 3000,
    estimatedTotal: 36000,
    finalTotal: 38640,
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:05:00.000Z',
  })

  it('acepta el DTO completo (incluye pesos reales y total final)', () => {
    expect(orderDtoSchema.safeParse(validDto()).success).toBe(true)
  })

  it('acepta pedido legacy sin teléfono, envío, final ni updatedAt', () => {
    const { customerPhone: _p, shippingCost: _s, finalTotal: _f, updatedAt: _u, ...legacy } = validDto()
    expect(orderDtoSchema.safeParse(legacy).success).toBe(true)
  })

  it.each([
    ['storeId interno', { storeId: 'leche-y-miel' }],
    ['customerId interno', { customerId: 'cust_01' }],
    ['teléfono no canónico', { customerPhone: '+57 300 123 4567' }],
    ['fecha con offset', { createdAt: '2026-09-03T10:00:00+02:00' }],
    ['fecha sin zona', { createdAt: '2026-09-03 10:00:00' }],
    ['estimado decimal', { estimatedTotal: 36000.5 }],
    ['final negativo', { finalTotal: -1 }],
    ['estado legacy', { status: 'ask' }],
  ])('rechaza %s', (_label, patch) => {
    expect(orderDtoSchema.safeParse({ ...validDto(), ...patch }).success).toBe(false)
  })

  it('DTO de domicilio solo GPS y pickup sin dirección/GPS', () => {
    const gps = { ...validDto(), deliveryData: { lat: 3.5, lng: -74.8 } }
    expect(orderDtoSchema.safeParse(gps).success).toBe(true)
    expect(orderDtoSchema.safeParse({ ...validDto(), deliveryData: {} }).success).toBe(false)

    const pickup = { ...validDto(), deliveryType: 'pickup', shippingCost: 0, deliveryData: { timeSlot: 'morning' } }
    expect(orderDtoSchema.safeParse(pickup).success).toBe(true)
    expect(orderDtoSchema.safeParse({ ...pickup, deliveryData: { lat: 3.5, lng: -74.8 } }).success).toBe(false)
    expect(orderDtoSchema.safeParse({ ...pickup, shippingCost: 3000 }).success).toBe(false)
  })

  it('finalTotal exige el peso real de todos los ítems variables', () => {
    const dto = validDto()
    const { kilosReal: _omit, ...withoutReal } = dto.items[0]!
    const noWeight = { ...dto, items: [withoutReal] }
    const result = orderDtoSchema.safeParse(noWeight)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((i) => i.path.join('.'))).toContain('finalTotal')

    // Sin final y sin peso real: válido (estimación original preservada).
    const { finalTotal: _final, ...estimateOnly } = noWeight
    expect(orderDtoSchema.safeParse(estimateOnly).success).toBe(true)

    // Un ítem pesado y otro sin pesar: sigue sin permitir final.
    const mixed = { ...dto, items: [dto.items[0], { ...withoutReal, id: 'prod_pollo' }] }
    expect(orderDtoSchema.safeParse(mixed).success).toBe(false)

    // Solo unitarios: finalTotal permitido.
    const unit = { ...dto, items: [{ id: 'arroz', qty: 1, priceAtMoment: 5500 }] }
    expect(orderDtoSchema.safeParse(unit).success).toBe(true)
  })

  it('kilosReal solo en peso variable', () => {
    const dto = validDto()
    const fixedWithReal = { ...dto, items: [{ id: 'arroz', qty: 1, priceAtMoment: 5500, kilosReal: 1 }] }
    expect(orderDtoSchema.safeParse(fixedWithReal).success).toBe(false)
  })

  it('confirmación de creación', () => {
    expect(
      orderConfirmationSchema.safeParse({ orderId: 'MAUI-1', status: 'received', estimatedTotal: 9000 }).success,
    ).toBe(true)
    expect(
      orderConfirmationSchema.safeParse({ orderId: 'MAUI-1', status: 'ready', estimatedTotal: 9000 }).success,
    ).toBe(false)
  })
})
