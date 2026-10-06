import { describe, expect, it } from 'vitest'
import {
  CONTRACT_VERSION_HEADER,
  allowedNextStatuses,
  canReopenPreparation,
  canTransition,
  contractVersionFrom,
  createOrderRequestSchema,
  formatOrderReference,
  orderConfirmationSchema,
  orderDtoSchema,
  orderListResponseSchema,
  pendingPickItems,
  toV1OrderConfirmation,
  toV1OrderDto,
  toV1OrderList,
  updateOrderItemsRequestSchema,
  updateOrderStatusRequestSchema,
  type OrderDto,
} from '../../../shared/contracts/index.js'
import { toOrderDto, toOrderDtoFor } from '../../src/domain/orders/orderMappers.js'
import { internalOrder, validDeliveryRequest, validPickupRequest } from './fixtures.js'
import * as v1 from './legacy/ordersV1.js'

/** Pedido v2 completo: referencia, método no efectivo, ítem alistado y snapshot original tras sustituir. */
const fullV2Order = (): OrderDto => toOrderDto(internalOrder({
  status: 'preparing', version: 5, reference: 1248, paymentMethod: 'bre_b',
  items: [
    { id: 'prod_queso', name: 'Queso', qty: 1, priceAtMoment: 9000, substitutedFor: 'prod_leche', picked: true },
    { id: 'prod_carne', name: 'Carne molida', qty: 1, priceAtMoment: 22000, is_variable_weight: true, kilosRequested: 1.5, kilosReal: 1.237, picked: true },
  ],
  originalItems: [
    { id: 'prod_leche', name: 'Leche entera 1L', qty: 2, priceAtMoment: 4500 },
    { id: 'prod_carne', name: 'Carne molida', qty: 1, priceAtMoment: 22000, is_variable_weight: true, kilosRequested: 1.5 },
  ],
  finalTotal: 39214,
}))

describe('negociación del contrato (X-Maui-Contract)', () => {
  it('solo el valor vigente activa v2; ausente, repetido u otro valor es v1', () => {
    expect(CONTRACT_VERSION_HEADER).toBe('X-Maui-Contract')
    expect(contractVersionFrom('2')).toBe(2)
    for (const header of [undefined, '', '1', '3', ' 2', ['2'], ['2', '2'], 2]) expect(contractVersionFrom(header)).toBe(1)
  })

  it('el contrato v1 congelado rechaza la respuesta v2: añadir campos opcionales no basta', () => {
    const dto = fullV2Order()
    expect(orderDtoSchema.safeParse(dto).success).toBe(true)
    const legacy = v1.orderDtoSchema.safeParse(dto)
    expect(legacy.success).toBe(false)
    const unknown = legacy.success ? [] : legacy.error.issues.flatMap((issue) => ('keys' in issue ? issue.keys : []))
    expect(unknown.sort()).toEqual(['paymentMethod', 'picked', 'picked', 'reference'].sort())
  })

  it('la proyección v1 de un pedido v2 completo valida con el contrato v1 congelado y conserva todo lo demás', () => {
    const dto = fullV2Order()
    const legacy = toV1OrderDto(dto)
    expect(v1.orderDtoSchema.parse(legacy)).toEqual(legacy)
    expect(legacy).not.toHaveProperty('reference')
    expect(legacy).not.toHaveProperty('paymentMethod')
    expect(JSON.stringify(legacy)).not.toContain('picked')
    // Nada más se pierde: v2 = v1 + los tres campos.
    const { reference: _r, paymentMethod: _p, items, ...rest } = dto
    expect(legacy).toEqual({ ...rest, items: items.map(({ picked: _picked, ...item }) => item) })
    expect(toOrderDtoFor(internalOrder({ reference: 7 }), 1)).toEqual(toV1OrderDto(toOrderDto(internalOrder({ reference: 7 }))))
  })

  it('confirmación y listado v1 validan con los esquemas congelados; los v2 con los vigentes', () => {
    const confirmation = orderConfirmationSchema.parse({ orderId: 'ord_1', status: 'received', estimatedTotal: 9000, reference: 3 })
    expect(v1.orderConfirmationSchema.safeParse(confirmation).success).toBe(false)
    expect(v1.orderConfirmationSchema.parse(toV1OrderConfirmation(confirmation))).toEqual({ orderId: 'ord_1', status: 'received', estimatedTotal: 9000 })

    const page = orderListResponseSchema.parse({ items: [fullV2Order(), fullV2Order()], nextCursor: 'abc' })
    expect(v1.orderListResponseSchema.safeParse(page).success).toBe(false)
    expect(v1.orderListResponseSchema.parse(toV1OrderList(page)).items).toHaveLength(2)
  })

  it('las peticiones de las apps anteriores siguen siendo válidas con el contrato vigente', () => {
    for (const body of [validPickupRequest(), validDeliveryRequest()]) {
      expect(v1.createOrderRequestSchema.safeParse(body).success).toBe(true)
      expect(createOrderRequestSchema.safeParse(body).success).toBe(true)
    }
    const weight = { expectedVersion: 3, changes: [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.2 }, { type: 'remove', itemId: 'prod_leche' }] }
    expect(updateOrderItemsRequestSchema.safeParse(weight).success).toBe(true)
    for (const status of ['confirmed', 'preparing', 'ready', 'in_delivery', 'delivered']) {
      expect(updateOrderStatusRequestSchema.safeParse({ status, expectedVersion: 2 }).success).toBe(true)
    }
  })
})

describe('ME-01: método de pago', () => {
  it('opcional al crear (sin elegir = efectivo); solo cash, qr o bre_b', () => {
    expect(createOrderRequestSchema.parse(validPickupRequest()).paymentMethod).toBeUndefined()
    for (const paymentMethod of ['cash', 'qr', 'bre_b']) {
      expect(createOrderRequestSchema.parse({ ...validPickupRequest(), paymentMethod }).paymentMethod).toBe(paymentMethod)
    }
    for (const paymentMethod of ['QR', 'nequi', 'card', '', null]) {
      expect(createOrderRequestSchema.safeParse({ ...validPickupRequest(), paymentMethod }).success).toBe(false)
    }
  })

  it('el DTO lo admite solo con valores conocidos y el modelo interno siempre lo proyecta', () => {
    expect(toOrderDto(internalOrder()).paymentMethod).toBe('cash')
    expect(orderDtoSchema.safeParse({ ...fullV2Order(), paymentMethod: 'pagado' }).success).toBe(false)
  })
})

describe('ME-03: alistado y reapertura', () => {
  it('marcar, desmarcar y borrar peso son cambios válidos; sin peso real no se admite una línea variable alistada', () => {
    const changes = [
      { type: 'pick', itemId: 'prod_leche', picked: true },
      { type: 'pick', itemId: 'prod_pan', picked: false },
      { type: 'weight', itemId: 'prod_carne', kilosReal: null },
    ]
    expect(updateOrderItemsRequestSchema.safeParse({ expectedVersion: 2, changes }).success).toBe(true)
    for (const bad of [{ type: 'pick', itemId: 'prod_leche' }, { type: 'pick', itemId: 'prod_leche', picked: 'si' }, { type: 'pick', itemId: 'prod_leche', picked: true, kilosReal: 1 }]) {
      expect(updateOrderItemsRequestSchema.safeParse({ expectedVersion: 2, changes: [bad] }).success).toBe(false)
    }
    const dto = fullV2Order()
    const unweighed = { ...dto, finalTotal: undefined, items: [dto.items[0], { ...dto.items[1], kilosReal: undefined }] }
    const issues = orderDtoSchema.safeParse(JSON.parse(JSON.stringify(unweighed)))
    expect(issues.success ? [] : issues.error.issues.map((issue) => issue.path.join('.'))).toEqual(['items.1.picked'])
  })

  it('pendientes: sin marca o variable sin peso', () => {
    const items = [
      { id: 'a', picked: true as const },
      { id: 'b' },
      { id: 'c', is_variable_weight: true, kilosReal: 1, picked: true as const },
      { id: 'd', is_variable_weight: true, picked: true as const },
    ]
    expect(pendingPickItems(items).map((item) => item.id)).toEqual(['b', 'd'])
    expect(pendingPickItems([])).toEqual([])
  })

  it('reabrir solo de listo a preparando; los avances habituales no lo incluyen', () => {
    expect(canReopenPreparation('ready')).toBe(true)
    for (const status of ['received', 'confirmed', 'preparing', 'in_delivery', 'delivered', 'cancelled'] as const) {
      expect(canReopenPreparation(status)).toBe(false)
    }
    for (const deliveryType of ['pickup', 'delivery'] as const) {
      expect(canTransition('ready', 'preparing', deliveryType)).toBe(true)
      expect(allowedNextStatuses('ready', deliveryType)).not.toContain('preparing')
      expect(canTransition('in_delivery', 'preparing', deliveryType)).toBe(false)
      expect(canTransition('ready', 'confirmed', deliveryType)).toBe(false)
    }
  })
})

describe('ME-04: referencia comercial', () => {
  it('«Pedido #» con seis cifras rellenadas y sin cortar desde 1 000 000', () => {
    expect(formatOrderReference(1)).toBe('Pedido #000001')
    expect(formatOrderReference(1248)).toBe('Pedido #001248')
    expect(formatOrderReference(999_999)).toBe('Pedido #999999')
    expect(formatOrderReference(1_000_000)).toBe('Pedido #1000000')
    expect(formatOrderReference(123_456_789)).toBe('Pedido #123456789')
  })

  it('entero positivo; la referencia no sustituye el ID del pedido', () => {
    for (const reference of [0, -1, 1.5, '12', 2_147_483_648]) {
      expect(orderDtoSchema.safeParse({ ...fullV2Order(), reference }).success).toBe(false)
    }
    expect(fullV2Order()).toMatchObject({ orderId: '01HJ0000000000000000000001', reference: 1248 })
  })
})
