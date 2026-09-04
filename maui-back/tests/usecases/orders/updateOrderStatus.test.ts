import { beforeEach, describe, expect, it } from 'vitest'
import { createOrder } from '../../../src/usecases/orders/createOrder.js'
import { updateOrderStatus } from '../../../src/usecases/orders/updateOrderStatus.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import type { Clock } from '../../../src/shared/clock.js'
import { OrderStatus } from '../../../src/domain/orders/Order.js'
import { NotFoundError, ValidationError } from '../../../src/shared/errors.js'

const clock: Clock = {
  now: () => new Date('2026-09-03T10:00:00.000Z'),
  nowIso: () => '2026-09-03T10:00:00.000Z',
}

const seedOrder = async (repo: OrdersRepositoryMemory) =>
  createOrder(
    { orders: repo, clock },
    {
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
          quantity: 1,
          isVariableWeight: false,
        },
      ],
    },
  )

describe('updateOrderStatus', () => {
  let repo: OrdersRepositoryMemory

  beforeEach(() => {
    repo = new OrdersRepositoryMemory()
  })

  it('permite received → preparing', async () => {
    const order = await seedOrder(repo)
    const updated = await updateOrderStatus(
      { orders: repo, clock },
      order.id,
      OrderStatus.PREPARING,
    )
    expect(updated.status).toBe(OrderStatus.PREPARING)
  })

  it('rechaza transiciones ilegales', async () => {
    const order = await seedOrder(repo)
    await expect(
      updateOrderStatus({ orders: repo, clock }, order.id, OrderStatus.DELIVERED),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechaza cambios sobre estados finales', async () => {
    const order = await seedOrder(repo)
    await updateOrderStatus({ orders: repo, clock }, order.id, OrderStatus.CANCELLED)
    await expect(
      updateOrderStatus({ orders: repo, clock }, order.id, OrderStatus.PREPARING),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('lanza NotFoundError si el pedido no existe', async () => {
    await expect(
      updateOrderStatus({ orders: repo, clock }, '01HJ0000000000000000000000', OrderStatus.PREPARING),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
