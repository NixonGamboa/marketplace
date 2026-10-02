import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listOrdersQuerySchema, type ListOrdersQuery } from '../../../../shared/contracts/index.js'
import { AuthorizationError } from '../../../src/domain/auth/errors.js'
import type { Order } from '../../../src/domain/orders/Order.js'
import type { OrderActor } from '../../../src/domain/orders/orderAccess.js'
import { OrdersRepositoryMemory } from '../../../src/infra/memory/OrdersRepositoryMemory.js'
import { ValidationError } from '../../../src/shared/errors.js'
import { listOrdersForActor } from '../../../src/usecases/orders/listOrders.js'
import { internalOrder } from '../../contratos/fixtures.js'
import { forceStatus } from '../../orders/forceStatus.js'

const customerA: OrderActor = { id: 'acc_a', role: 'customer', storeId: null }
const customerB: OrderActor = { id: 'acc_b', role: 'customer', storeId: null }
const operator: OrderActor = { id: 'acc_op', role: 'operator', storeId: 'leche-y-miel' }
const owner: OrderActor = { id: 'acc_owner', role: 'owner', storeId: 'leche-y-miel' }
const foreignOwner: OrderActor = { id: 'acc_foreign', role: 'owner', storeId: 'otra-tienda' }

const query = (raw: Record<string, unknown> = {}): ListOrdersQuery => listOrdersQuerySchema.parse(raw)

const at = (seconds: number) => new Date(Date.UTC(2026, 8, 3, 10, 0, seconds)).toISOString()
const idOf = (n: number) => `01HJ${String(n).padStart(22, '0')}`
const orderAt = (n: number, seconds: number, overrides: Partial<Order> = {}): Order =>
  internalOrder({ id: idOf(n), createdAt: at(seconds), updatedAt: at(seconds), customerId: customerA.id, ...overrides })

const ids = (items: Order[]) => items.map(order => order.id)

/** Recorre todas las páginas con el mismo filtro; devuelve las páginas y sus cursores. */
async function walk(orders: OrdersRepositoryMemory, actor: OrderActor, raw: Record<string, unknown>) {
  const pages: Order[][] = []
  let cursor: string | undefined
  for (let guard = 0; guard < 50; guard += 1) {
    const result = await listOrdersForActor({ orders }, actor, query({ ...raw, ...(cursor ? { cursor } : {}) }))
    pages.push(result.items)
    if (result.nextCursor === null) return pages
    cursor = result.nextCursor
  }
  throw new Error('La paginación no termina')
}

describe('listOrdersForActor', () => {
  let orders: OrdersRepositoryMemory

  beforeEach(async () => {
    orders = new OrdersRepositoryMemory()
    await orders.create(orderAt(1, 1))
    await orders.create(orderAt(2, 2, { customerId: customerB.id }))
    await orders.create(orderAt(3, 3))
    await orders.create(orderAt(4, 4, { storeId: 'otra-tienda', customerId: customerA.id }))
    await orders.create(orderAt(5, 5, { storeId: 'otra-tienda', customerId: customerB.id }))
  })

  describe('aislamiento', () => {
    it('cliente: solo sus pedidos, de cualquier tienda', async () => {
      expect(ids((await listOrdersForActor({ orders }, customerA, query())).items)).toEqual([idOf(4), idOf(3), idOf(1)])
      expect(ids((await listOrdersForActor({ orders }, customerB, query())).items)).toEqual([idOf(5), idOf(2)])
    })

    it('owner y operator: todos los de su tienda y ninguno de otra', async () => {
      for (const actor of [owner, operator]) {
        expect(ids((await listOrdersForActor({ orders }, actor, query())).items)).toEqual([idOf(3), idOf(2), idOf(1)])
      }
      expect(ids((await listOrdersForActor({ orders }, foreignOwner, query())).items)).toEqual([idOf(5), idOf(4)])
    })

    it('el alcance viene del actor y no de la query: parámetros de scope no existen en el contrato', () => {
      for (const raw of [{ storeId: 'otra-tienda' }, { customerId: customerB.id }, { userId: customerB.id }]) {
        expect(listOrdersQuerySchema.safeParse(raw).success).toBe(false)
      }
    })

    it('personal sin tienda o rol desconocido: 403 sin consultar el repositorio', async () => {
      const listPage = vi.spyOn(orders, 'listPage')
      const noStore: OrderActor = { id: 'acc_x', role: 'owner', storeId: null }
      const unknownRole = { id: 'acc_y', role: 'admin', storeId: 'leche-y-miel' } as unknown as OrderActor
      for (const actor of [noStore, unknownRole]) {
        await expect(listOrdersForActor({ orders }, actor, query())).rejects.toBeInstanceOf(AuthorizationError)
      }
      expect(listPage).not.toHaveBeenCalled()
    })

    it('un cliente con storeId inesperado sigue limitado a sus pedidos', async () => {
      const odd: OrderActor = { id: customerA.id, role: 'customer', storeId: 'otra-tienda' }
      expect(ids((await listOrdersForActor({ orders }, odd, query())).items)).toEqual([idOf(4), idOf(3), idOf(1)])
    })
  })

  describe('paginación', () => {
    it('recorre todas las filas una vez y la última página no trae cursor', async () => {
      const pages = await walk(orders, owner, { limit: '2' })
      expect(pages.map(ids)).toEqual([[idOf(3), idOf(2)], [idOf(1)]])
    })

    it('un total exacto al límite no genera página vacía', async () => {
      const result = await listOrdersForActor({ orders }, owner, query({ limit: '3' }))
      expect(result.items).toHaveLength(3)
      expect(result.nextCursor).toBeNull()
    })

    it('desempata por ID cuando varias filas comparten fecha y no pierde ni repite filas', async () => {
      const tied = new OrdersRepositoryMemory()
      for (const n of [7, 3, 9, 1, 5]) await tied.create(orderAt(n, 10))
      await tied.create(orderAt(11, 20))
      await tied.create(orderAt(12, 5))

      const pages = await walk(tied, owner, { limit: '2' })
      expect(pages.flat().map(order => order.id)).toEqual([11, 9, 7, 5, 3, 1, 12].map(idOf))
      expect(new Set(pages.flat().map(order => order.id)).size).toBe(7)
    })

    it('el tamaño de página puede cambiar entre páginas con el mismo cursor', async () => {
      const first = await listOrdersForActor({ orders }, owner, query({ limit: '1' }))
      const second = await listOrdersForActor({ orders }, owner, query({ limit: '2', cursor: first.nextCursor! }))
      expect(ids(second.items)).toEqual([idOf(2), idOf(1)])
      expect(second.nextCursor).toBeNull()
    })

    it('el cursor no contiene datos legibles del pedido', async () => {
      const { nextCursor } = await listOrdersForActor({ orders }, owner, query({ limit: '1' }))
      expect(nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(nextCursor).not.toContain(idOf(3))
    })
  })

  describe('filtros', () => {
    beforeEach(async () => {
      await forceStatus(orders, idOf(2), 'ready', at(30))
      await forceStatus(orders, idOf(1), 'ready', at(31))
    })

    it('status', async () => {
      expect(ids((await listOrdersForActor({ orders }, owner, query({ status: 'ready' }))).items)).toEqual([idOf(2), idOf(1)])
      expect((await listOrdersForActor({ orders }, owner, query({ status: 'cancelled' }))).items).toEqual([])
    })

    it('from es inclusivo y to exclusivo', async () => {
      const range = (from: string, to: string) => listOrdersForActor({ orders }, owner, query({ from, to }))
      expect(ids((await range(at(1), at(3))).items)).toEqual([idOf(2), idOf(1)])
      expect(ids((await range(at(2), at(4))).items)).toEqual([idOf(3), idOf(2)])
      expect((await range(at(3), at(4))).items).toHaveLength(1)
    })

    it('combina filtros con paginación y el cursor conserva la consulta', async () => {
      const pages = await walk(orders, owner, { status: 'ready', limit: '1' })
      expect(pages.map(ids)).toEqual([[idOf(2)], [idOf(1)]])
    })

    it('búsqueda por ID (prefijo), nombre y teléfono, sin distinguir mayúsculas', async () => {
      await orders.create(orderAt(20, 40, { customerName: 'Beatriz Gómez', customerPhone: '573105550202', id: '01HJPEDIDOABC' }))
      const find = async (q: string) => ids((await listOrdersForActor({ orders }, owner, query({ q }))).items)
      expect(await find('01hjpedido')).toEqual(['01HJPEDIDOABC'])
      expect(await find('EDIDOABC')).toEqual([]) // el ID se busca por prefijo
      expect(await find('beatriz')).toEqual(['01HJPEDIDOABC'])
      expect(await find('gómez')).toEqual(['01HJPEDIDOABC'])
      expect(await find('+57 310 555 0202')).toEqual(['01HJPEDIDOABC'])
      expect(await find('5550202')).toEqual(['01HJPEDIDOABC'])
      expect(await find('zzz')).toEqual([])
    })

    it('% y _ son texto, no comodines', async () => {
      await orders.create(orderAt(21, 41, { customerName: '100%_Real' }))
      const find = async (q: string) => (await listOrdersForActor({ orders }, owner, query({ q }))).items.length
      expect(await find('%')).toBe(1)
      expect(await find('_')).toBe(1)
      expect(await find('0%_R')).toBe(1)
      expect(await find('1%R')).toBe(0)
    })
  })

  describe('cursor ligado a la consulta', () => {
    const cursorFor = async (actor: OrderActor, raw: Record<string, unknown> = {}) =>
      (await listOrdersForActor({ orders }, actor, query({ limit: '1', ...raw }))).nextCursor!

    const rejects = (actor: OrderActor, raw: Record<string, unknown>) =>
      expect(listOrdersForActor({ orders }, actor, query(raw))).rejects.toBeInstanceOf(ValidationError)

    it('se rechaza con otros filtros', async () => {
      const cursor = await cursorFor(owner, { status: 'received' })
      await rejects(owner, { status: 'ready', cursor })
      await rejects(owner, { cursor })
      await rejects(owner, { status: 'received', q: 'doña', cursor })
      await rejects(owner, { status: 'received', from: at(0), cursor })
      await rejects(owner, { status: 'received', to: at(99), cursor })
    })

    it('se rechaza con otra cuenta, otro rol u otra tienda', async () => {
      const cursor = await cursorFor(owner)
      await rejects(operator, { cursor })
      await rejects(foreignOwner, { cursor })
      await rejects(customerA, { cursor })
      await rejects({ ...owner, storeId: 'otra-tienda' }, { cursor })
      const customerCursor = await cursorFor(customerA)
      await rejects(customerB, { cursor: customerCursor })
    })

    it('se rechaza si está manipulado, truncado o no es un cursor', async () => {
      const cursor = await cursorFor(owner)
      const forged = Buffer.from(JSON.stringify({ v: 1, t: '2026-09-03T10:00:00.000000Z', i: idOf(1), b: 'x'.repeat(43) })).toString('base64url')
      for (const bad of [cursor.slice(0, -4), `${cursor}A`, forged, 'e30', 'AAAA', Buffer.from('no json').toString('base64url')]) {
        await rejects(owner, { cursor: bad })
      }
    })

    it('el error no revela el motivo ni el contenido', async () => {
      const cursor = await cursorFor(owner)
      const error = await listOrdersForActor({ orders }, operator, query({ cursor })).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).issues).toEqual([{ path: 'cursor', message: 'Cursor inválido para esta consulta' }])
    })

    it('el 403 tiene prioridad sobre un cursor inválido', async () => {
      const noStore: OrderActor = { id: 'acc_x', role: 'operator', storeId: null }
      await expect(listOrdersForActor({ orders }, noStore, query({ cursor: 'AAAA' }))).rejects.toBeInstanceOf(AuthorizationError)
    })
  })
})
