import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  auditListResponseSchema,
  orderConfirmationSchema,
  orderDtoSchema,
  orderListResponseSchema,
  type OrderDto,
} from '../../../shared/contracts/index.js'
import * as v1 from '../contratos/legacy/ordersV1.js'
import { FOREIGN_STORE, STORE, pickupOrderBody, startHttpWorld, type Actor, type HttpWorld, type WireResponse } from './httpWorld.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

/** Cabecera que enviarán las apps nuevas; las anteriores no la envían. */
const V2 = { 'x-maui-contract': '2' }

/**
 * ME-01, ME-03 y ME-04 con handlers reales, sesiones reales y PostgreSQL embebido con todas las
 * migraciones. Las respuestas sin cabecera se validan con el contrato congelado de 1.0.1 (lo que
 * ejecuta una PWA o un admin en caché). PGlite serializa las conexiones: la contención real entre
 * instancias en Neon queda para el smoke/E2E de test.
 */
describe('ME-01/03/04 por HTTP sobre PostgreSQL', () => {
  let world: HttpWorld
  let actors: HttpWorld['actors']
  beforeAll(async () => {
    world = await startHttpWorld()
    actors = world.actors
  })
  afterAll(async () => { await world?.close() })

  const expectStatus = (response: WireResponse, status: number): WireResponse => {
    expect(response.status, JSON.stringify(response.body)).toBe(status)
    return response
  }
  const send = (method: string, path: string, actor: Actor, body?: unknown, headers: Record<string, string> = V2) =>
    world.fetch(method, path, { cookie: actor.cookie, ...(body === undefined ? {} : { body }), headers })
  const placeV2 = async (actor: Actor, overrides: Record<string, unknown> = {}, key = randomUUID()) =>
    orderConfirmationSchema.parse(expectStatus(await world.fetch('POST', '/api/orders', {
      cookie: actor.cookie, body: pickupOrderBody(actor, overrides), headers: { 'idempotency-key': key, ...V2 },
    }), 201).body)
  const readV2 = async (id: string, actor: Actor = actors.operator): Promise<OrderDto> =>
    orderDtoSchema.parse(expectStatus(await send('GET', `/api/orders/${id}`, actor), 200).body)
  const statusTo = (id: string, actor: Actor, expectedVersion: number, status: string) =>
    send('PATCH', `/api/orders/${id}/status`, actor, { status, expectedVersion })
  const change = (id: string, actor: Actor, expectedVersion: number, changes: unknown[]) =>
    send('PATCH', `/api/orders/${id}`, actor, { expectedVersion, changes })
  const ok = (response: WireResponse): OrderDto => orderDtoSchema.parse(expectStatus(response, 200).body)
  const issues = (response: WireResponse) => (response.body as { issues?: { path: string }[] }).issues?.map((issue) => issue.path)
  /** Pedido en preparación: leche (fijo) y carne (variable, 1 kg pedido). */
  const preparing = async (overrides: Record<string, unknown> = {}): Promise<OrderDto> => {
    const { orderId } = await placeV2(actors.customer, overrides)
    let current = await readV2(orderId)
    for (const status of ['confirmed', 'preparing']) current = ok(await statusTo(orderId, actors.operator, current.version!, status))
    return current
  }
  const readyOrder = async (): Promise<OrderDto> => {
    const prepared = await preparing()
    const picked = ok(await change(prepared.orderId, actors.operator, prepared.version!, [
      { type: 'pick', itemId: 'prod_leche', picked: true }, { type: 'weight', itemId: 'prod_carne', kilosReal: 1.2 },
    ]))
    return ok(await statusTo(prepared.orderId, actors.operator, picked.version!, 'ready'))
  }

  describe('compatibilidad: sin cabecera, la forma exacta de 1.0.1', () => {
    it('crear, detalle, listados y ambos PATCH validan con el contrato congelado, aunque el pedido tenga datos v2', async () => {
      const created = expectStatus(await world.placeOrder(actors.customer, { paymentMethod: 'bre_b' }), 201)
      const { orderId } = v1.orderConfirmationSchema.parse(created.body)
      expect(created.header('Vary')).toBe('Cookie, Origin, X-Maui-Contract')

      const legacy = { headers: {} as Record<string, string> }
      const detail = v1.orderDtoSchema.parse(expectStatus(await send('GET', `/api/orders/${orderId}`, actors.customer, undefined, legacy.headers), 200).body)
      v1.orderListResponseSchema.parse(expectStatus(await send('GET', '/api/orders', actors.customer, undefined, legacy.headers), 200).body)
      v1.orderListResponseSchema.parse(expectStatus(await send('GET', '/api/orders?limit=100', actors.operator, undefined, legacy.headers), 200).body)
      const confirmed = v1.orderDtoSchema.parse(expectStatus(await send('PATCH', `/api/orders/${orderId}/status`, actors.operator,
        { status: 'confirmed', expectedVersion: detail.version }, legacy.headers), 200).body)
      const preparingNow = v1.orderDtoSchema.parse(expectStatus(await send('PATCH', `/api/orders/${orderId}/status`, actors.operator,
        { status: 'preparing', expectedVersion: confirmed.version }, legacy.headers), 200).body)
      // El admin anterior solo pesa: el peso marca la línea, pero la marca no viaja en v1.
      const weighed = v1.orderDtoSchema.parse(expectStatus(await send('PATCH', `/api/orders/${orderId}`, actors.operator,
        { expectedVersion: preparingNow.version, changes: [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.1 }] }, legacy.headers), 200).body)
      expect(JSON.stringify(weighed)).not.toMatch(/"(picked|reference|paymentMethod)"/)
      // Lo mismo, pedido por una app nueva, sí lo trae.
      expect(await readV2(orderId)).toMatchObject({ paymentMethod: 'bre_b', reference: expect.any(Number), items: [{ id: 'prod_leche' }, { id: 'prod_carne', picked: true }] })
      // Listo sigue bloqueado para el admin anterior con un error explícito en español.
      const blocked = expectStatus(await send('PATCH', `/api/orders/${orderId}/status`, actors.operator, { status: 'ready', expectedVersion: weighed.version }, legacy.headers), 400)
      expect((blocked.body as { message: string }).message).toContain('por alistar')
    })
  })

  describe('ME-01: método de pago', () => {
    it('se guarda al crear, sale en detalle y listado v2; sin elegir es efectivo; un valor desconocido es 400', async () => {
      const qr = await placeV2(actors.customer, { paymentMethod: 'qr' })
      expect(await readV2(qr.orderId, actors.customer)).toMatchObject({ paymentMethod: 'qr' })
      const list = orderListResponseSchema.parse(expectStatus(await send('GET', '/api/orders?limit=100', actors.operator), 200).body)
      expect(list.items.find((item) => item.orderId === qr.orderId)).toMatchObject({ paymentMethod: 'qr', reference: qr.reference })
      const cash = await placeV2(actors.customer)
      expect(await readV2(cash.orderId)).toMatchObject({ paymentMethod: 'cash' })
      const invalid = expectStatus(await world.fetch('POST', '/api/orders', {
        cookie: actors.customer.cookie, body: pickupOrderBody(actors.customer, { paymentMethod: 'pagado' }), headers: { 'idempotency-key': randomUUID(), ...V2 },
      }), 400)
      expect(issues(invalid)).toEqual(['paymentMethod'])
    })
  })

  describe('ME-04: referencia comercial', () => {
    it('creación simultánea sin duplicados; el reintento devuelve el mismo número; detalle y listado coinciden', async () => {
      const key = randomUUID()
      const first = await placeV2(actors.customer, {}, key)
      const burst = await Promise.all(Array.from({ length: 10 }, (_, index) => placeV2(index % 2 ? actors.other : actors.customer)))
      const numbers = [first, ...burst].map((confirmation) => confirmation.reference!)
      expect(new Set(numbers).size).toBe(numbers.length)
      expect(Math.min(...burst.map((confirmation) => confirmation.reference!))).toBeGreaterThan(first.reference!)
      expect(await placeV2(actors.customer, {}, key)).toEqual(first)
      expect((await readV2(first.orderId, actors.customer)).reference).toBe(first.reference)
      const duplicates = await world.embedded.pg.query<{ n: number }>(
        'select count(*)::int as n from (select store_id, reference_number from orders group by 1, 2 having count(*) > 1) d')
      expect(duplicates.rows[0]?.n).toBe(0)
    })

    it('numeración independiente por tienda; conocer un número no da acceso a un pedido ajeno', async () => {
      const mine = await placeV2(actors.customer)
      const foreign = await world.repositories.orders.create({
        ...(await world.repositories.orders.findById(mine.orderId))!, id: `ord_ajena_${randomUUID().slice(0, 8)}`, storeId: FOREIGN_STORE,
      })
      const foreignCount = await world.embedded.pg.query<{ n: number }>('select count(*)::int as n from orders where store_id = $1', [FOREIGN_STORE])
      expect(foreign.reference).toBe(foreignCount.rows[0]?.n)
      for (const path of [`/api/orders/${mine.reference}`, `/api/orders/${encodeURIComponent(`#${mine.reference}`)}`]) {
        expect([400, 404]).toContain((await send('GET', path, actors.other)).status)
      }
      expectStatus(await send('GET', `/api/orders/${mine.orderId}`, actors.other), 404)
      expectStatus(await send('GET', `/api/orders/${mine.orderId}`, actors.foreign), 404)
      const otherList = orderListResponseSchema.parse(expectStatus(await send('GET', '/api/orders?limit=100', actors.other), 200).body)
      expect(otherList.items.some((item) => item.orderId === mine.orderId)).toBe(false)
      expect(STORE).not.toBe(FOREIGN_STORE)
    })
  })

  describe('ME-03: alistado persistente', () => {
    it('las marcas y pesos se ven igual desde otra sesión; borrar peso desmarca; desmarcar conserva el peso; 409 no cambia nada', async () => {
      const prepared = await preparing()
      const marked = ok(await change(prepared.orderId, actors.operator, prepared.version!, [
        { type: 'pick', itemId: 'prod_leche', picked: true }, { type: 'weight', itemId: 'prod_carne', kilosReal: 1.25 },
      ]))
      // Otro dispositivo (owner) ve el mismo avance.
      expect((await readV2(marked.orderId, actors.owner)).items).toEqual(marked.items)
      expect(marked.items.map((item) => item.picked)).toEqual([true, true])

      const stale = expectStatus(await change(prepared.orderId, actors.owner, prepared.version!, [{ type: 'pick', itemId: 'prod_leche', picked: false }]), 409)
      expect((stale.body as { error: string }).error).toBe('ORDER_VERSION_CONFLICT')
      expect(await readV2(marked.orderId)).toEqual(marked)

      const unpicked = ok(await change(prepared.orderId, actors.owner, marked.version!, [{ type: 'pick', itemId: 'prod_carne', picked: false }]))
      expect(unpicked.items[1]).toMatchObject({ kilosReal: 1.25 })
      expect(unpicked.items[1]).not.toHaveProperty('picked')
      expect(unpicked.finalTotal).toBe(marked.finalTotal)
      const cleared = ok(await change(prepared.orderId, actors.operator, unpicked.version!, [{ type: 'weight', itemId: 'prod_carne', kilosReal: null }]))
      expect(cleared.items[1]).not.toHaveProperty('kilosReal')
      expect(cleared).not.toHaveProperty('finalTotal')
      expect(issues(expectStatus(await change(prepared.orderId, actors.operator, cleared.version!, [{ type: 'pick', itemId: 'prod_carne', picked: true }]), 400)))
        .toEqual(['changes.0.picked'])
      // Un cliente no marca; otra tienda ve 404.
      expectStatus(await change(prepared.orderId, actors.customer, cleared.version!, [{ type: 'pick', itemId: 'prod_leche', picked: false }]), 403)
      expectStatus(await change(prepared.orderId, actors.foreign, cleared.version!, [{ type: 'pick', itemId: 'prod_leche', picked: false }]), 404)
    })

    it('listo exige todo alistado y pesado; los importes y el snapshot de creación no cambian con las marcas', async () => {
      const prepared = await preparing()
      const snapshotOf = async () => (await world.embedded.pg.query<{ snapshot: unknown }>('select snapshot from order_creations where order_id = $1', [prepared.orderId])).rows[0]?.snapshot
      const snapshot = await snapshotOf()
      expect(issues(expectStatus(await statusTo(prepared.orderId, actors.operator, prepared.version!, 'ready'), 400))).toEqual(['items.0.picked', 'items.1.picked'])
      const picked = ok(await change(prepared.orderId, actors.operator, prepared.version!, [{ type: 'pick', itemId: 'prod_leche', picked: true }]))
      expect(picked).toMatchObject({ estimatedTotal: prepared.estimatedTotal })
      expect(picked).not.toHaveProperty('finalTotal')
      expect(issues(expectStatus(await statusTo(prepared.orderId, actors.operator, picked.version!, 'ready'), 400))).toEqual(['items.1.picked'])
      const weighed = ok(await change(prepared.orderId, actors.operator, picked.version!, [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.5 }]))
      const ready = ok(await statusTo(prepared.orderId, actors.operator, weighed.version!, 'ready'))
      // 2 × 4500 + 22000 × 1,5 = 42000 (retiro sin envío); la estimación con 1 kg se conserva.
      expect(ready).toMatchObject({ status: 'ready', finalTotal: 42000, estimatedTotal: 31000 })
      expect(await snapshotOf()).toEqual(snapshot)
    })
  })

  describe('ME-03: reabrir preparación', () => {
    it('owner y operator reabren desde listo con versión; conserva datos e historial y audita actor y fecha', async () => {
      const ready = await readyOrder()
      const reopened = ok(await statusTo(ready.orderId, actors.owner, ready.version!, 'preparing'))
      const { status: _s, version: _v, updatedAt: _u, ...kept } = ready
      expect(reopened).toMatchObject({ ...kept, status: 'preparing', version: ready.version! + 1 })
      const audit = auditListResponseSchema.parse(expectStatus(await send('GET', `/api/audit?entity=order&entityId=${ready.orderId}`, actors.owner), 200).body)
      expect(audit.items[0]).toMatchObject({
        action: 'status_changed', actorKind: 'account', actorId: actors.owner.id,
        metadata: { previousStatus: 'ready', status: 'preparing', previousVersion: ready.version, version: reopened.version },
      })
      expect(Date.parse(audit.items[0]!.createdAt)).toBeGreaterThan(0)
      // Las marcas quedan en el historial sin detalle nuevo: el admin anterior sigue leyendo la auditoría.
      expect(audit.items.filter((event) => event.action === 'items_changed').length).toBeGreaterThan(0)

      // Corregir y volver a listo; el operador también puede reabrir.
      const corrected = ok(await change(ready.orderId, actors.operator, reopened.version!, [{ type: 'weight', itemId: 'prod_carne', kilosReal: 1.5 }]))
      const readyAgain = ok(await statusTo(ready.orderId, actors.operator, corrected.version!, 'ready'))
      expect(readyAgain).toMatchObject({ finalTotal: 42000, estimatedTotal: ready.estimatedTotal })
      expect(ok(await statusTo(ready.orderId, actors.operator, readyAgain.version!, 'preparing')).status).toBe('preparing')
    })

    it('sin permiso, con versión vieja o fuera de listo no reabre y nada cambia', async () => {
      const ready = await readyOrder()
      expectStatus(await statusTo(ready.orderId, actors.customer, ready.version!, 'preparing'), 403)
      expectStatus(await statusTo(ready.orderId, actors.foreign, ready.version!, 'preparing'), 404)
      expectStatus(await statusTo(ready.orderId, actors.operator, ready.version! - 1, 'preparing'), 409)
      expect(await readV2(ready.orderId)).toEqual(ready)

      const delivered = ok(await statusTo(ready.orderId, actors.operator, ready.version!, 'delivered'))
      expect(issues(expectStatus(await statusTo(ready.orderId, actors.operator, delivered.version!, 'preparing'), 400))).toEqual(['status'])
      expect(await readV2(ready.orderId)).toEqual(delivered)
    })
  })
})
