import { beforeEach, describe, expect, it } from 'vitest'
import { updateOrderStatus } from '../../../src/usecases/orders/updateOrderStatus.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import type { Clock } from '../../../src/shared/clock.js'
import { OrderStatus, type Order } from '../../../src/domain/orders/Order.js'
import type { OrderActor } from '../../../src/domain/orders/orderAccess.js'
import { OrderVersionConflictError } from '../../../src/domain/orders/orderLifecycle.js'
import { AuthorizationError } from '../../../src/domain/auth/errors.js'
import { NotFoundError, ValidationError } from '../../../src/shared/errors.js'
import { internalOrder } from '../../contratos/fixtures.js'
import { forceStatus } from '../../orders/forceStatus.js'

const clock: Clock = {
  now: () => new Date('2026-09-03T10:00:00.000Z'),
  nowIso: () => '2026-09-03T10:00:00.000Z',
}

const operator: OrderActor = { id: 'acc_operador', role: 'operator', storeId: 'leche-y-miel' }

let seq = 0
const seedOrder = async (repo: OrdersRepositoryMemory, delivery = false): Promise<Order> => {
  seq += 1
  const base = internalOrder({
    id: `01HJ00000000000000000000${String(seq).padStart(2, '0')}`,
    items: [{ id: 'prod_leche', name: 'Leche entera 1L', qty: 2, priceAtMoment: 4500 }],
    estimatedTotal: 12000,
  })
  return repo.create(
    delivery ? base : { ...base, deliveryType: 'pickup', deliveryData: { timeSlot: 'morning' }, shippingCost: 0, estimatedTotal: 9000 },
  )
}

describe('updateOrderStatus', () => {
  let repo: OrdersRepositoryMemory
  const change = (actor: OrderActor, id: string, body: unknown) => updateOrderStatus({ orders: repo, clock }, actor, id, body)

  beforeEach(() => {
    repo = new OrdersRepositoryMemory()
  })

  it('permite received → confirmed con la versión leída y registra el actor', async () => {
    const order = await seedOrder(repo)
    const updated = await change(operator, order.id, { status: OrderStatus.CONFIRMED, expectedVersion: 1 })
    expect(updated).toMatchObject({ status: OrderStatus.CONFIRMED, version: 2, updatedBy: operator.id, updatedAt: clock.nowIso() })
    expect(await repo.findById(order.id)).toEqual(updated)
  })

  it('rechaza transiciones ilegales sin modificar el pedido', async () => {
    const order = await seedOrder(repo)
    for (const status of [OrderStatus.DELIVERED, OrderStatus.PREPARING]) {
      await expect(change(operator, order.id, { status, expectedVersion: 1 })).rejects.toBeInstanceOf(ValidationError)
    }
    expect(await repo.findById(order.id)).toMatchObject({ status: 'received', version: 1 })
  })

  it('rechaza cambios sobre estados finales', async () => {
    const order = await seedOrder(repo)
    await change(operator, order.id, { status: OrderStatus.CANCELLED, expectedVersion: 1, reason: 'Cliente desistió' })
    await expect(change(operator, order.id, { status: OrderStatus.CONFIRMED, expectedVersion: 2 })).rejects.toBeInstanceOf(ValidationError)
    expect(await repo.findById(order.id)).toMatchObject({ status: 'cancelled', version: 2, cancellationReason: 'Cliente desistió' })
  })

  it('body inválido: 400 explícito antes de leer', async () => {
    const order = await seedOrder(repo)
    for (const body of [{ status: 'confirmed' }, { status: 'cancelled', expectedVersion: 1 }, { status: 'confirmed', expectedVersion: 1, by: 'x' }, null]) {
      await expect(change(operator, order.id, body)).rejects.toBeInstanceOf(ValidationError)
    }
  })

  it('versión vieja → 409 sin escribir', async () => {
    const order = await seedOrder(repo)
    await change(operator, order.id, { status: 'confirmed', expectedVersion: 1 })
    await expect(change(operator, order.id, { status: 'cancelled', expectedVersion: 1, reason: 'Pedido duplicado' }))
      .rejects.toBeInstanceOf(OrderVersionConflictError)
    expect(await repo.findById(order.id)).toMatchObject({ status: 'confirmed', version: 2 })
  })

  it('dos transiciones concurrentes sobre la misma versión: una sola se aplica', async () => {
    const order = await seedOrder(repo)
    const results = await Promise.allSettled([
      change(operator, order.id, { status: 'confirmed', expectedVersion: 1 }),
      change(operator, order.id, { status: 'cancelled', expectedVersion: 1, reason: 'Cliente desistió' }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected && rejected.reason).toBeInstanceOf(OrderVersionConflictError)
    expect((await repo.findById(order.id))?.version).toBe(2)
  })

  it('lanza NotFoundError si el pedido no existe', async () => {
    await expect(change(operator, '01HJ0000000000000000000000', { status: OrderStatus.CONFIRMED, expectedVersion: 1 }))
      .rejects.toBeInstanceOf(NotFoundError)
  })

  it('in_delivery solo existe para domicilio', async () => {
    const pickup = await forceStatus(repo, (await seedOrder(repo)).id, OrderStatus.READY)
    const delivery = await forceStatus(repo, (await seedOrder(repo, true)).id, OrderStatus.READY)

    await expect(change(operator, pickup.id, { status: OrderStatus.IN_DELIVERY, expectedVersion: pickup.version }))
      .rejects.toBeInstanceOf(ValidationError)
    const updated = await change(operator, delivery.id, { status: OrderStatus.IN_DELIVERY, expectedVersion: delivery.version })
    expect(updated.status).toBe(OrderStatus.IN_DELIVERY)
  })

  it('owner y operator de la tienda cambian estado; cliente recibe 403 antes de validar o leer', async () => {
    const order = await seedOrder(repo)
    const owner: OrderActor = { id: 'acc_duena', role: 'owner', storeId: 'leche-y-miel' }
    const confirmed = await change(owner, order.id, { status: OrderStatus.CONFIRMED, expectedVersion: 1 })
    expect(confirmed.status).toBe(OrderStatus.CONFIRMED)

    const customer: OrderActor = { id: order.customerId, role: 'customer', storeId: null }
    for (const id of [order.id, '01HJ0000000000000000000000']) {
      for (const body of [{ status: OrderStatus.CANCELLED, expectedVersion: 2, reason: 'Ya no lo quiero' }, {}]) {
        await expect(change(customer, id, body)).rejects.toBeInstanceOf(AuthorizationError)
      }
    }
    expect((await repo.findById(order.id))?.status).toBe(OrderStatus.CONFIRMED)
  })

  it('personal de otra tienda recibe el mismo NotFoundError que un pedido inexistente', async () => {
    const order = await seedOrder(repo)
    const foreign: OrderActor = { id: 'acc_ajeno', role: 'owner', storeId: 'otra-tienda' }

    await expect(change(foreign, order.id, { status: OrderStatus.CONFIRMED, expectedVersion: 1 })).rejects.toBeInstanceOf(NotFoundError)
    expect((await repo.findById(order.id))?.status).toBe(OrderStatus.RECEIVED)
  })
})
