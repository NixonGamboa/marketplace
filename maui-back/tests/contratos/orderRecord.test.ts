import { describe, expect, it } from 'vitest'
import { orderDtoSchema } from '../../../shared/contracts/index.js'
import { toOrderConfirmation, toOrderDto } from '../../src/domain/orders/orderMappers.js'
import {
  orderFromRecord,
  orderToRecord,
  substitutionFromStored,
  type StoredOrderRecord,
} from '../../src/domain/orders/orderRecord.js'
import { internalOrder } from './fixtures.js'

/** Fila tal como la dejó el backend previo a T-04 (migración 0000, sin columnas nuevas). */
const legacyRecord = (overrides: Partial<StoredOrderRecord> = {}): StoredOrderRecord => ({
  id: '01HJ0000000000000000000002',
  storeId: 'leche-y-miel',
  customerId: 'cust_01',
  customerName: 'Doña Carmen',
  customerPhone: '+573001234567',
  items: [
    { productId: 'prod_leche', name: 'Leche entera 1L', priceAtMoment: 4500, quantity: 2, isVariableWeight: false },
    { productId: 'prod_carne', name: 'Carne molida', priceAtMoment: 22000, kilos: 1.5, isVariableWeight: true },
  ],
  total: 42000,
  status: 'received',
  deliveryMode: 'delivery',
  deliveryAddress: 'Calle 8 # 5-32',
  deliveryLat: null,
  deliveryLng: null,
  deliveryTimeSlot: null,
  substitutionPreference: 'ask',
  shippingCost: null,
  finalTotal: null,
  createdAt: '2026-09-03 10:00:00.123456+00',
  updatedAt: '2026-09-03 10:05:00+00',
  // Columnas de 0006 tal como quedan en filas previas: versión por defecto y sin cambios.
  version: 1,
  updatedBy: null,
  originalItems: null,
  itemAdjustments: null,
  cancellationReason: null,
  cancelledAt: null,
  ...overrides,
})

describe('mapeo legacy → modelo interno', () => {
  it('convierte ítems, sustitución, total y fechas sin inventar datos', () => {
    const order = orderFromRecord(legacyRecord())

    expect(order.items).toEqual([
      { id: 'prod_leche', name: 'Leche entera 1L', priceAtMoment: 4500, qty: 2 },
      {
        id: 'prod_carne',
        name: 'Carne molida',
        priceAtMoment: 22000,
        qty: 1,
        is_variable_weight: true,
        kilosRequested: 1.5,
      },
    ])
    expect(order.items[1]).not.toHaveProperty('kilosReal')
    expect(order.substitutionPreference).toBe('call_me')
    expect(order.estimatedTotal).toBe(42000)
    expect(order).not.toHaveProperty('shippingCost')
    expect(order).not.toHaveProperty('finalTotal')
    expect(order.customerPhone).toBe('573001234567')
    expect(order.deliveryType).toBe('delivery')
    expect(order.deliveryData).toEqual({ address: 'Calle 8 # 5-32' })
    expect(order.createdAt).toBe('2026-09-03T10:00:00.123Z')
    expect(order.updatedAt).toBe('2026-09-03T10:05:00.000Z')
  })

  it('el DTO público de un pedido legacy valida contra el contrato', () => {
    const dto = toOrderDto(orderFromRecord(legacyRecord()))
    expect(orderDtoSchema.safeParse(dto).success).toBe(true)
  })

  it.each([
    ['ask', 'call_me'],
    ['allow', 'similar'],
    ['none', 'remove'],
    ['call_me', 'call_me'],
    ['similar', 'similar'],
    ['remove', 'remove'],
  ])('sustitución %s → %s', (stored, expected) => {
    expect(substitutionFromStored(stored)).toBe(expected)
  })

  it('falla de forma explícita ante valores desconocidos', () => {
    expect(() => substitutionFromStored('maybe')).toThrow()
    expect(() => orderFromRecord(legacyRecord({ status: 'shipped' }))).toThrow()
    expect(() => orderFromRecord(legacyRecord({ deliveryMode: 'drone' }))).toThrow()
  })

  it('omite el teléfono irrecuperable y descarta dirección en retiro legacy', () => {
    const order = orderFromRecord(legacyRecord({ customerPhone: '123', deliveryMode: 'pickup' }))
    expect(order).not.toHaveProperty('customerPhone')
    expect(order.deliveryData).toEqual({})
  })

  it('fila previa a 0006: versión 1, sin actor, snapshot original ni cancelación', () => {
    const order = orderFromRecord(legacyRecord({ status: 'cancelled' }))
    expect(order.version).toBe(1)
    for (const field of ['updatedBy', 'originalItems', 'cancellationReason', 'cancelledAt']) {
      expect(order).not.toHaveProperty(field)
    }
    expect(orderDtoSchema.safeParse(toOrderDto(order)).success).toBe(true)
  })

  it('un item legacy variable no se convierte en peso real al leer', () => {
    const order = orderFromRecord(legacyRecord({ status: 'delivered' }))
    expect(order.items.every((item) => item.kilosReal === undefined)).toBe(true)
    expect(order.finalTotal).toBeUndefined()
  })
})

describe('persistencia del modelo canónico', () => {
  it('expone la unidad persistida de ítems vigentes y originales sin inventarla en legacy', () => {
    const base = internalOrder()
    const items = base.items.map((item, index) => ({ ...item, unit: index === 0 ? 'paquete' : 'Por Kilogramo' }))
    const order = internalOrder({ items, originalItems: items })
    const dto = toOrderDto(orderFromRecord(orderToRecord(order)))

    expect(dto.items.map((item) => item.unit)).toEqual(['paquete', 'Por Kilogramo'])
    expect(dto.originalItems?.map((item) => item.unit)).toEqual(['paquete', 'Por Kilogramo'])
    const legacy = toOrderDto(orderFromRecord(legacyRecord()))
    expect(legacy.items.every((item) => !Object.hasOwn(item, 'unit'))).toBe(true)
  })

  it('ida y vuelta conserva GPS, franja, envío, estimación y snapshot', () => {
    const order = internalOrder({ finalTotal: 47640 })
    const record = orderToRecord(order)

    expect(record).toMatchObject({
      total: 45000,
      shippingCost: 3000,
      finalTotal: 47640,
      deliveryMode: 'delivery',
      deliveryLat: 3.5402,
      deliveryLng: -74.8965,
      deliveryTimeSlot: 'asap',
      substitutionPreference: 'similar',
    })
    expect(orderFromRecord(record)).toEqual(order)
  })

  it('normaliza fechas con formato Postgres a ISO UTC', () => {
    const record = { ...orderToRecord(internalOrder()), createdAt: '2026-09-03 05:00:00-05' }
    expect(orderFromRecord(record).createdAt).toBe('2026-09-03T10:00:00.000Z')
  })
})

describe('DTO público vs modelo interno (privacidad)', () => {
  it('proyecta con lista blanca: sin storeId, actor ni nombres internos', () => {
    const dto = toOrderDto(internalOrder({ updatedBy: 'acc_operador_interno' }))

    expect(Object.keys(dto).sort()).toEqual(
      [
        'orderId',
        'userId',
        'status',
        'items',
        'deliveryType',
        'deliveryData',
        'substitutionPreference',
        'customerName',
        'customerPhone',
        'shippingCost',
        'estimatedTotal',
        'createdAt',
        'updatedAt',
        'version',
      ].sort(),
    )
    expect(JSON.stringify(dto)).not.toContain('leche-y-miel')
    expect(JSON.stringify(dto)).not.toContain('acc_operador_interno')
    expect(dto.orderId).toBe('01HJ0000000000000000000001')
    expect(dto.userId).toBe('cust_01')
    expect(orderDtoSchema.safeParse(dto).success).toBe(true)
  })

  it('descarta props extra de ítems y entrega (record/storeId) mediante whitelist', () => {
    const leaky = internalOrder()
    const item = { ...leaky.items[0]!, storeId: 'leche-y-miel', internalNote: 'x' }
    const order = {
      ...leaky,
      items: [item],
      deliveryData: { ...leaky.deliveryData, routeId: 'r-9' },
    } as unknown as typeof leaky

    const dto = toOrderDto(order)
    expect(dto.items[0]).toEqual({ id: 'prod_leche', name: 'Leche entera 1L', qty: 2, priceAtMoment: 4500 })
    expect(dto.deliveryData).not.toHaveProperty('routeId')
    expect(JSON.stringify(dto)).not.toContain('leche-y-miel')
    expect(JSON.stringify(dto)).not.toContain('internalNote')
  })

  it('no devuelve un pedido persistido que incumple el contrato de salida', () => {
    expect(() => toOrderDto(internalOrder({ createdAt: 'ayer' }))).toThrow()
    expect(() => toOrderDto(internalOrder({ finalTotal: 1000 }))).toThrow() // sin kilosReal en el ítem variable
    expect(() => toOrderDto(internalOrder({ customerPhone: '+57 300 123 4567' }))).toThrow()
  })

  it('domicilio solo GPS: persiste y se expone sin dirección', () => {
    const order = internalOrder({ deliveryData: { lat: 3.5402, lng: -74.8965 } })
    const record = orderToRecord(order)
    expect(record).toMatchObject({ deliveryAddress: null, deliveryLat: 3.5402, deliveryLng: -74.8965 })
    expect(orderFromRecord(record)).toEqual(order)
    expect(orderDtoSchema.safeParse(toOrderDto(orderFromRecord(record))).success).toBe(true)
  })

  it('confirmación mínima de creación', () => {
    expect(toOrderConfirmation(internalOrder())).toEqual({
      orderId: '01HJ0000000000000000000001',
      status: 'received',
      estimatedTotal: 45000,
    })
  })
})
