import { beforeEach, describe, expect, it } from 'vitest'
import { createOrder } from '../../../src/usecases/orders/createOrder.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import type { Clock } from '../../../src/shared/clock.js'
import { OrderStatus, type OrderContext } from '../../../src/domain/orders/Order.js'
import { ValidationError } from '../../../src/shared/errors.js'
import { toOrderDto } from '../../../src/domain/orders/orderMappers.js'
import { orderDtoSchema } from '../../../../shared/contracts/index.js'
import { validDeliveryRequest, validPickupRequest, variableWeightItem } from '../../contratos/fixtures.js'

const fixedClock: Clock = {
  now: () => new Date('2026-09-03T10:00:00.000Z'),
  nowIso: () => '2026-09-03T10:00:00.000Z',
}

const context: OrderContext = { storeId: 'leche-y-miel' }

describe('createOrder', () => {
  let repo: OrdersRepositoryMemory
  const deps = () => ({ orders: repo, clock: fixedClock })

  beforeEach(() => {
    repo = new OrdersRepositoryMemory()
  })

  it('crea un pedido y calcula estimado para items unitarios', async () => {
    const order = await createOrder(deps(), validPickupRequest(), context)

    expect(order.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(order.status).toBe(OrderStatus.RECEIVED)
    expect(order.estimatedTotal).toBe(9000)
    expect(order.finalTotal).toBeUndefined()
    expect(order.shippingCost).toBe(0)
    expect(order.customerPhone).toBe('573001234567')
    expect(order.createdAt).toBe('2026-09-03T10:00:00.000Z')
    expect(order.updatedAt).toBe('2026-09-03T10:00:00.000Z')
    expect(await repo.findById(order.id)).toEqual(order)
  })

  it('calcula estimado para items de peso variable preservando kilos solicitados', async () => {
    const order = await createOrder(
      deps(),
      { ...validPickupRequest(), items: [variableWeightItem()] },
      context,
    )

    expect(order.estimatedTotal).toBe(33000)
    expect(order.items[0]).toMatchObject({ kilosRequested: 1.5, is_variable_weight: true })
    expect(order.items[0]).not.toHaveProperty('kilosReal')
  })

  it('incluye el envío en el estimado y conserva GPS y dirección de entrega', async () => {
    const order = await createOrder(deps(), validDeliveryRequest(), context)

    expect(order.estimatedTotal).toBe(9000 + 3000)
    expect(order.shippingCost).toBe(3000)
    expect(order.deliveryType).toBe('delivery')
    expect(order.deliveryData).toEqual({
      address: 'Calle 8 # 5-32, Dolores, Tolima',
      lat: 3.5402,
      lng: -74.8965,
    })
  })

  it('crea un domicilio solo con GPS (sin dirección) y lo conserva', async () => {
    const order = await createOrder(
      deps(),
      { ...validDeliveryRequest(), deliveryData: { lat: 3.5402, lng: -74.8965 } },
      context,
    )

    expect(order.deliveryData).toEqual({ lat: 3.5402, lng: -74.8965 })
    expect(await repo.findById(order.id)).toEqual(order)
    expect(toOrderDto(order).deliveryData).toEqual({ lat: 3.5402, lng: -74.8965 })
  })

  it('rechaza domicilio sin dirección ni GPS y retiro con envío o GPS', async () => {
    for (const body of [
      { ...validDeliveryRequest(), deliveryData: { timeSlot: 'asap' } },
      { ...validPickupRequest(), shippingCost: 3000 },
      { ...validPickupRequest(), deliveryData: { lat: 3.5, lng: -74.8 } },
    ]) {
      await expect(createOrder(deps(), body, context)).rejects.toBeInstanceOf(ValidationError)
    }
  })

  it('redondea por línea a pesos enteros', async () => {
    const order = await createOrder(
      deps(),
      {
        ...validPickupRequest(),
        items: [{ ...variableWeightItem(), priceAtMoment: 4500, kilosRequested: 0.333 }],
      },
      context,
    )
    expect(order.estimatedTotal).toBe(1499)
  })

  it('tienda y cliente salen del contexto confiable; sin él, el userId no verificado', async () => {
    const trusted = await createOrder(
      deps(),
      validPickupRequest(),
      { storeId: 'tienda-ctx', customerId: 'cust_sesion' },
    )
    expect(trusted.storeId).toBe('tienda-ctx')
    expect(trusted.customerId).toBe('cust_sesion')

    const anonymous = await createOrder(deps(), validPickupRequest(), context)
    expect(anonymous.customerId).toBe('cust_01')
  })

  it('el DTO público no expone la tienda y valida contra el contrato', async () => {
    const order = await createOrder(deps(), validDeliveryRequest(), context)
    const dto = toOrderDto(order)

    expect(dto).not.toHaveProperty('storeId')
    expect(dto.orderId).toBe(order.id)
    expect(orderDtoSchema.safeParse(dto).success).toBe(true)
  })

  it('rechaza campos de contexto o resultado enviados por el cliente', async () => {
    for (const extra of [{ storeId: 'otra' }, { status: 'delivered' }, { estimatedTotal: 1 }]) {
      await expect(
        createOrder(deps(), { ...validPickupRequest(), ...extra }, context),
      ).rejects.toBeInstanceOf(ValidationError)
    }
  })

  it('rechaza delivery sin dirección', async () => {
    await expect(
      createOrder(deps(), { ...validPickupRequest(), deliveryType: 'delivery', deliveryData: {}, shippingCost: 3000 }, context),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechaza item peso variable sin kilos', async () => {
    const { kilosRequested: _omit, ...withoutKilos } = variableWeightItem()
    await expect(
      createOrder(deps(), { ...validPickupRequest(), items: [withoutKilos] }, context),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechaza input inválido con zod y reporta issues con ruta', async () => {
    const error = await createOrder(deps(), { foo: 'bar' }, context).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ValidationError)
    const issues = (error as ValidationError).issues as { path: string; message: string }[]
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0]).toEqual({ path: expect.any(String), message: expect.any(String) })
  })

  it('rechaza un total estimado por encima del máximo COP', async () => {
    const items = Array.from({ length: 3 }, (_, i) => ({
      id: `caro-${i}`,
      qty: 1,
      priceAtMoment: 60_000_000,
    }))
    await expect(
      createOrder(deps(), { ...validPickupRequest(), items }, context),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
