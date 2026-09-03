import { beforeEach, describe, expect, it } from 'vitest'
import { createOrder } from '../../../src/usecases/orders/createOrder.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import type { Clock } from '../../../src/shared/clock.js'
import { OrderStatus } from '../../../src/domain/orders/Order.js'
import { ValidationError } from '../../../src/shared/errors.js'

const fixedClock: Clock = {
  now: () => new Date('2026-09-03T10:00:00.000Z'),
  nowIso: () => '2026-09-03T10:00:00.000Z',
}

const baseInput = {
  storeId: 'leche-y-miel',
  customerId: 'cust_01',
  customerName: 'Doña Carmen',
  customerPhone: '+573001234567',
  deliveryMode: 'pickup' as const,
  substitutionPreference: 'ask' as const,
  items: [
    {
      productId: 'prod_leche',
      name: 'Leche entera 1L',
      priceAtMoment: 4500,
      quantity: 2,
      isVariableWeight: false,
    },
  ],
}

describe('createOrder', () => {
  let repo: OrdersRepositoryMemory

  beforeEach(() => {
    repo = new OrdersRepositoryMemory()
  })

  it('crea un pedido y calcula total para items unitarios', async () => {
    const order = await createOrder({ orders: repo, clock: fixedClock }, baseInput)

    expect(order.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(order.status).toBe(OrderStatus.RECEIVED)
    expect(order.total).toBe(9000)
    expect(order.createdAt).toBe('2026-09-03T10:00:00.000Z')
    expect(await repo.findById(order.id)).toEqual(order)
  })

  it('calcula total para items de peso variable', async () => {
    const order = await createOrder(
      { orders: repo, clock: fixedClock },
      {
        ...baseInput,
        items: [
          {
            productId: 'prod_carne',
            name: 'Carne molida',
            priceAtMoment: 22000,
            kilos: 1.5,
            isVariableWeight: true,
          },
        ],
      },
    )

    expect(order.total).toBe(33000)
  })

  it('rechaza delivery sin dirección', async () => {
    await expect(
      createOrder(
        { orders: repo, clock: fixedClock },
        { ...baseInput, deliveryMode: 'delivery' },
      ),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechaza item peso variable sin kilos', async () => {
    await expect(
      createOrder(
        { orders: repo, clock: fixedClock },
        {
          ...baseInput,
          items: [
            {
              productId: 'prod_carne',
              name: 'Carne molida',
              priceAtMoment: 22000,
              isVariableWeight: true,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechaza input inválido con zod', async () => {
    await expect(
      createOrder({ orders: repo, clock: fixedClock }, { foo: 'bar' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
