import { beforeEach, describe, expect, it } from 'vitest'
import { createOrder } from '../../../src/usecases/orders/createOrder.js'
import { updateOrderStatus } from '../../../src/usecases/orders/updateOrderStatus.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import type { Clock } from '../../../src/shared/clock.js'
import { OrderStatus } from '../../../src/domain/orders/Order.js'
import { NotFoundError, ValidationError } from '../../../src/shared/errors.js'
import { validDeliveryRequest, validPickupRequest } from '../../contratos/fixtures.js'

const clock: Clock = {
  now: () => new Date('2026-09-03T10:00:00.000Z'),
  nowIso: () => '2026-09-03T10:00:00.000Z',
}

const context = { storeId: 'leche-y-miel' }

const seedOrder = async (repo: OrdersRepositoryMemory, delivery = false) =>
  createOrder(
    { orders: repo, clock },
    delivery ? validDeliveryRequest() : validPickupRequest(),
    context,
  )

describe('updateOrderStatus', () => {
  let repo: OrdersRepositoryMemory

  beforeEach(() => {
    repo = new OrdersRepositoryMemory()
  })

  it('permite received → confirmed', async () => {
    const order = await seedOrder(repo)
    const updated = await updateOrderStatus(
      { orders: repo, clock },
      order.id,
      OrderStatus.CONFIRMED,
    )
    expect(updated.status).toBe(OrderStatus.CONFIRMED)
  })

  it('rechaza transiciones ilegales', async () => {
    const order = await seedOrder(repo)
    await expect(
      updateOrderStatus({ orders: repo, clock }, order.id, OrderStatus.DELIVERED),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      updateOrderStatus({ orders: repo, clock }, order.id, OrderStatus.PREPARING),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechaza cambios sobre estados finales', async () => {
    const order = await seedOrder(repo)
    await updateOrderStatus({ orders: repo, clock }, order.id, OrderStatus.CANCELLED)
    await expect(
      updateOrderStatus({ orders: repo, clock }, order.id, OrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('lanza NotFoundError si el pedido no existe', async () => {
    await expect(
      updateOrderStatus({ orders: repo, clock }, '01HJ0000000000000000000000', OrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('in_delivery solo existe para domicilio', async () => {
    const pickup = await seedOrder(repo)
    const delivery = await seedOrder(repo, true)
    await repo.updateStatus(pickup.id, OrderStatus.READY, clock.nowIso())
    await repo.updateStatus(delivery.id, OrderStatus.READY, clock.nowIso())

    await expect(
      updateOrderStatus({ orders: repo, clock }, pickup.id, OrderStatus.IN_DELIVERY),
    ).rejects.toBeInstanceOf(ValidationError)

    const updated = await updateOrderStatus(
      { orders: repo, clock },
      delivery.id,
      OrderStatus.IN_DELIVERY,
    )
    expect(updated.status).toBe(OrderStatus.IN_DELIVERY)
  })
})
