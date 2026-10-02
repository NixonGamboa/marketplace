import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthorizationError } from '../../../src/domain/auth/errors.js'
import type { CatalogProduct } from '../../../src/domain/catalog/Catalog.js'
import type { Order } from '../../../src/domain/orders/Order.js'
import type { OrderActor } from '../../../src/domain/orders/orderAccess.js'
import { OrderVersionConflictError } from '../../../src/domain/orders/orderLifecycle.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import type { Clock } from '../../../src/shared/clock.js'
import { NotFoundError, ValidationError } from '../../../src/shared/errors.js'
import { updateOrderItems } from '../../../src/usecases/orders/updateOrderItems.js'
import { NOW_ISO, internalOrder } from '../../contratos/fixtures.js'

const clock: Clock = { now: () => new Date('2026-09-03T12:00:00.000Z'), nowIso: () => '2026-09-03T12:00:00.000Z' }
const operator: OrderActor = { id: 'acc_operador', role: 'operator', storeId: 'leche-y-miel' }

const queso: CatalogProduct = {
  id: 'prod_queso', storeId: 'leche-y-miel', categoryId: 'cat', name: 'Queso campesino', displayName: 'Queso',
  legalName: null, price: 9000, originalPrice: null, unit: '500 g', imageUrl: '/q.png', inStock: true,
  isVariableWeight: false, badge: null, currency: 'COP', description: null, nutritionalInfo: null,
  availability: null, active: true, archivedAt: null, version: 4, createdAt: NOW_ISO, updatedAt: NOW_ISO,
}

describe('updateOrderItems', () => {
  let orders: OrdersRepositoryMemory
  let order: Order
  const findProduct = vi.fn(async (storeId: string, id: string) => (storeId === queso.storeId && id === queso.id ? queso : null))
  const run = (actor: OrderActor, body: unknown, id = order.id) =>
    updateOrderItems({ orders, catalog: { findProduct }, clock }, actor, id, body)

  beforeEach(async () => {
    orders = new OrdersRepositoryMemory()
    findProduct.mockClear()
    order = await orders.create(internalOrder({ status: 'preparing', version: 3 }))
  })

  it('pesa, sustituye desde el catálogo de la tienda del pedido y guarda en bloque', async () => {
    const saveChange = vi.spyOn(orders, 'saveChange')
    const updated = await run(operator, {
      expectedVersion: 3,
      changes: [
        { type: 'weight', itemId: 'prod_carne', kilosReal: 1.237 },
        { type: 'substitute', itemId: 'prod_leche', productId: 'prod_queso', qty: 1 },
      ],
    })
    expect(findProduct).toHaveBeenCalledWith('leche-y-miel', 'prod_queso')
    expect(updated).toMatchObject({ version: 4, updatedBy: operator.id, finalTotal: 39214, estimatedTotal: 45000 })
    expect(updated.items[0]).toMatchObject({ id: 'prod_queso', name: 'Queso campesino', priceAtMoment: 9000, substitutedFor: 'prod_leche' })
    // La escritura exige que el sustituto siga en la versión leída.
    expect(saveChange.mock.calls[0]?.[0].products).toEqual([{ id: 'prod_queso', version: 4 }])
    expect(await orders.findById(order.id)).toEqual(updated)
  })

  it('cliente: 403 antes de validar o leer, incluso dueño del pedido', async () => {
    const customer: OrderActor = { id: order.customerId, role: 'customer', storeId: null }
    for (const body of [{ expectedVersion: 3, changes: [{ type: 'remove', itemId: 'prod_leche' }] }, { nada: true }]) {
      await expect(run(customer, body)).rejects.toBeInstanceOf(AuthorizationError)
    }
    expect(findProduct).not.toHaveBeenCalled()
  })

  it('otra tienda responde como inexistente; versión vieja 409; body inválido 400', async () => {
    await expect(run({ ...operator, storeId: 'otra-tienda' }, { expectedVersion: 3, changes: [{ type: 'remove', itemId: 'prod_leche' }] }))
      .rejects.toBeInstanceOf(NotFoundError)
    await expect(run(operator, { expectedVersion: 2, changes: [{ type: 'remove', itemId: 'prod_leche' }] }))
      .rejects.toBeInstanceOf(OrderVersionConflictError)
    await expect(run(operator, { expectedVersion: 3, changes: [{ type: 'remove', itemId: 'prod_leche', priceAtMoment: 1 }] }))
      .rejects.toBeInstanceOf(ValidationError)
    expect(await orders.findById(order.id)).toEqual(order)
  })

  it('dos ediciones concurrentes de la misma versión no se pisan', async () => {
    const results = await Promise.allSettled([
      run(operator, { expectedVersion: 3, changes: [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.1 }] }),
      run(operator, { expectedVersion: 3, changes: [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.9 }] }),
    ])
    const fulfilled = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
    expect(fulfilled).toHaveLength(1)
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: expect.any(OrderVersionConflictError) })
    expect(await orders.findById(order.id)).toEqual(fulfilled[0])
  })

  it('producto inexistente o de otra tienda: 400 sin escribir', async () => {
    await expect(run(operator, { expectedVersion: 3, changes: [{ type: 'substitute', itemId: 'prod_leche', productId: 'prod_ajeno', qty: 1 }] }))
      .rejects.toBeInstanceOf(ValidationError)
    expect((await orders.findById(order.id))?.version).toBe(3)
  })
})
