import { beforeEach, describe, expect, it } from 'vitest'
import { updateOrderStatus } from '../../../src/usecases/orders/updateOrderStatus.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import type { Clock } from '../../../src/shared/clock.js'
import { OrderStatus } from '../../../src/domain/orders/Order.js'
import type { OrderActor } from '../../../src/domain/orders/orderAccess.js'
import { AuthorizationError } from '../../../src/domain/auth/errors.js'
import { NotFoundError, ValidationError } from '../../../src/shared/errors.js'
import { internalOrder } from '../../contratos/fixtures.js'

const clock: Clock = {
  now: () => new Date('2026-09-03T10:00:00.000Z'),
  nowIso: () => '2026-09-03T10:00:00.000Z',
}

const operator: OrderActor = { id: 'acc_operador', role: 'operator', storeId: 'leche-y-miel' }

let seq = 0
const seedOrder = async (repo: OrdersRepositoryMemory, delivery = false) => {
  seq += 1
  const base = internalOrder({ id: `01HJ00000000000000000000${String(seq).padStart(2, '0')}` })
  return repo.create(
    delivery ? base : { ...base, deliveryType: 'pickup', deliveryData: { timeSlot: 'morning' }, shippingCost: 0 },
  )
}

describe('updateOrderStatus', () => {
  let repo: OrdersRepositoryMemory

  beforeEach(() => {
    repo = new OrdersRepositoryMemory()
  })

  it('permite received → confirmed', async () => {
    const order = await seedOrder(repo)
    const updated = await updateOrderStatus(
      { orders: repo, clock },
      operator,
      order.id,
      OrderStatus.CONFIRMED,
    )
    expect(updated.status).toBe(OrderStatus.CONFIRMED)
  })

  it('rechaza transiciones ilegales', async () => {
    const order = await seedOrder(repo)
    await expect(
      updateOrderStatus({ orders: repo, clock }, operator, order.id, OrderStatus.DELIVERED),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      updateOrderStatus({ orders: repo, clock }, operator, order.id, OrderStatus.PREPARING),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechaza cambios sobre estados finales', async () => {
    const order = await seedOrder(repo)
    await updateOrderStatus({ orders: repo, clock }, operator, order.id, OrderStatus.CANCELLED)
    await expect(
      updateOrderStatus({ orders: repo, clock }, operator, order.id, OrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('lanza NotFoundError si el pedido no existe', async () => {
    await expect(
      updateOrderStatus({ orders: repo, clock }, operator, '01HJ0000000000000000000000', OrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('in_delivery solo existe para domicilio', async () => {
    const pickup = await seedOrder(repo)
    const delivery = await seedOrder(repo, true)
    await repo.updateStatus(pickup.id, OrderStatus.READY, clock.nowIso())
    await repo.updateStatus(delivery.id, OrderStatus.READY, clock.nowIso())

    await expect(
      updateOrderStatus({ orders: repo, clock }, operator, pickup.id, OrderStatus.IN_DELIVERY),
    ).rejects.toBeInstanceOf(ValidationError)

    const updated = await updateOrderStatus(
      { orders: repo, clock },
      operator,
      delivery.id,
      OrderStatus.IN_DELIVERY,
    )
    expect(updated.status).toBe(OrderStatus.IN_DELIVERY)
  })

  it('owner y operator de la tienda cambian estado; cliente recibe 403 antes de leer', async () => {
    const order = await seedOrder(repo)
    const owner: OrderActor = { id: 'acc_duena', role: 'owner', storeId: 'leche-y-miel' }
    const confirmed = await updateOrderStatus({ orders: repo, clock }, owner, order.id, OrderStatus.CONFIRMED)
    expect(confirmed.status).toBe(OrderStatus.CONFIRMED)

    const customer: OrderActor = { id: order.customerId, role: 'customer', storeId: null }
    for (const id of [order.id, '01HJ0000000000000000000000']) {
      await expect(
        updateOrderStatus({ orders: repo, clock }, customer, id, OrderStatus.PREPARING),
      ).rejects.toBeInstanceOf(AuthorizationError)
    }
    expect((await repo.findById(order.id))?.status).toBe(OrderStatus.CONFIRMED)
  })

  it('personal de otra tienda recibe el mismo NotFoundError que un pedido inexistente', async () => {
    const order = await seedOrder(repo)
    const foreign: OrderActor = { id: 'acc_ajeno', role: 'owner', storeId: 'otra-tienda' }

    await expect(
      updateOrderStatus({ orders: repo, clock }, foreign, order.id, OrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect((await repo.findById(order.id))?.status).toBe(OrderStatus.RECEIVED)
  })
})
