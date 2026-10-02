import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createOrder } from '../../../src/usecases/orders/createOrder.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import { AuthRepositoryMemory } from '../../../src/infra/memory/AuthRepositoryMemory.js'
import { HmacBucketKeyer } from '../../../src/infra/auth/randomIds.js'
import type { Clock } from '../../../src/shared/clock.js'
import { OrderStatus, type OrderContext } from '../../../src/domain/orders/Order.js'
import { ORDER_CREATE_POLICY, type OrderActor } from '../../../src/domain/orders/orderAccess.js'
import { AuthorizationError, RateLimitedError } from '../../../src/domain/auth/errors.js'
import { ValidationError } from '../../../src/shared/errors.js'
import { toOrderDto } from '../../../src/domain/orders/orderMappers.js'
import { orderDtoSchema } from '../../../../shared/contracts/index.js'
import { validDeliveryRequest, validPickupRequest, variableWeightItem } from '../../contratos/fixtures.js'

const fixedClock: Clock = {
  now: () => new Date('2026-09-03T10:00:00.000Z'),
  nowIso: () => '2026-09-03T10:00:00.000Z',
}

const context: OrderContext = { storeId: 'leche-y-miel' }
const customer: OrderActor = { id: 'cust_01', role: 'customer', storeId: null }
const keys = new HmacBucketKeyer(randomBytes(32))

describe('createOrder', () => {
  let repo: OrdersRepositoryMemory
  let attempts: AuthRepositoryMemory
  const deps = () => ({ orders: repo, clock: fixedClock, attempts, keys })
  const create = (body: unknown, actor: OrderActor = customer, ctx: OrderContext = context) =>
    createOrder(deps(), actor, body, ctx)

  beforeEach(() => {
    repo = new OrdersRepositoryMemory()
    attempts = new AuthRepositoryMemory()
  })

  it('crea un pedido y calcula estimado para items unitarios', async () => {
    const order = await createOrder(deps(), customer, validPickupRequest(), context)

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
      customer,
      { ...validPickupRequest(), items: [variableWeightItem()] },
      context,
    )

    expect(order.estimatedTotal).toBe(33000)
    expect(order.items[0]).toMatchObject({ kilosRequested: 1.5, is_variable_weight: true })
    expect(order.items[0]).not.toHaveProperty('kilosReal')
  })

  it('incluye el envío en el estimado y conserva GPS y dirección de entrega', async () => {
    const order = await createOrder(deps(), customer, validDeliveryRequest(), context)

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
      customer,
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
      await expect(createOrder(deps(), customer, body, context)).rejects.toBeInstanceOf(ValidationError)
    }
  })

  it('redondea por línea a pesos enteros', async () => {
    const order = await createOrder(
      deps(),
      customer,
      {
        ...validPickupRequest(),
        items: [{ ...variableWeightItem(), priceAtMoment: 4500, kilosRequested: 0.333 }],
      },
      context,
    )
    expect(order.estimatedTotal).toBe(1499)
  })

  it('el dueño es el actor autenticado y la tienda la fija el servidor', async () => {
    const actor: OrderActor = { id: 'acc_sesion', role: 'customer', storeId: null }
    const order = await create({ ...validPickupRequest(), userId: actor.id }, actor, { storeId: 'tienda-ctx' })

    expect(order.customerId).toBe('acc_sesion')
    expect(order.storeId).toBe('tienda-ctx')
  })

  it('userId debe coincidir con el actor; distinto es manipulación (403)', async () => {
    const own = await create({ ...validPickupRequest(), userId: customer.id })
    expect(own.customerId).toBe(customer.id)

    await expect(create({ ...validPickupRequest(), userId: 'acc_otro' })).rejects.toBeInstanceOf(AuthorizationError)
    expect(await repo.listByStore(context.storeId)).toHaveLength(1)
  })

  it('solo un cliente crea pedidos: owner/operator reciben 403 sin persistir', async () => {
    for (const role of ['owner', 'operator'] as const) {
      const staff: OrderActor = { id: 'acc_staff', role, storeId: 'leche-y-miel' }
      await expect(create(validPickupRequest(), staff)).rejects.toBeInstanceOf(AuthorizationError)
    }
    expect(await repo.listByStore(context.storeId)).toHaveLength(0)
  })

  it('limita creaciones por cuenta; inválidos no consumen cupo y otra cuenta conserva el suyo', async () => {
    await expect(create({ foo: 'bar' })).rejects.toBeInstanceOf(ValidationError)
    for (let i = 0; i < ORDER_CREATE_POLICY.limit; i += 1) await create(validPickupRequest())

    const denied = await create(validPickupRequest()).catch((e: unknown) => e)
    expect(denied).toBeInstanceOf(RateLimitedError)
    expect((denied as RateLimitedError).retryAfterSeconds).toBeGreaterThan(0)
    expect(await repo.listByStore(context.storeId)).toHaveLength(ORDER_CREATE_POLICY.limit)

    const otherActor: OrderActor = { id: 'acc_otra', role: 'customer', storeId: null }
    const other = await create({ ...validPickupRequest(), userId: 'acc_otra' }, otherActor)
    expect(other.customerId).toBe('acc_otra')
  })

  it('el DTO público no expone la tienda y valida contra el contrato', async () => {
    const order = await createOrder(deps(), customer, validDeliveryRequest(), context)
    const dto = toOrderDto(order)

    expect(dto).not.toHaveProperty('storeId')
    expect(dto.orderId).toBe(order.id)
    expect(orderDtoSchema.safeParse(dto).success).toBe(true)
  })

  it('rechaza campos de contexto o resultado enviados por el cliente', async () => {
    for (const extra of [{ storeId: 'otra' }, { status: 'delivered' }, { estimatedTotal: 1 }]) {
      await expect(
        createOrder(deps(), customer, { ...validPickupRequest(), ...extra }, context),
      ).rejects.toBeInstanceOf(ValidationError)
    }
  })

  it('rechaza delivery sin dirección', async () => {
    await expect(
      createOrder(deps(), customer, { ...validPickupRequest(), deliveryType: 'delivery', deliveryData: {}, shippingCost: 3000 }, context),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechaza item peso variable sin kilos', async () => {
    const { kilosRequested: _omit, ...withoutKilos } = variableWeightItem()
    await expect(
      createOrder(deps(), customer, { ...validPickupRequest(), items: [withoutKilos] }, context),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechaza input inválido con zod y reporta issues con ruta', async () => {
    const error = await createOrder(deps(), customer, { foo: 'bar' }, context).catch((e: unknown) => e)

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
      createOrder(deps(), customer, { ...validPickupRequest(), items }, context),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
