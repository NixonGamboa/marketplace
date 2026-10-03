// Historial real del cliente con transporte simulado (no es evidencia de cierre real contra API/Postgres):
// los filtros q/status/from/to se validan con el esquema compartido y viajan al servidor antes de paginar.
import { describe, expect, it } from 'vitest'
import { createRealAuthService } from '../../realAuthService'
import { createRealOrderService } from '../../realOrderService'
import { createCheckoutIntents, type IntentStorage } from '../checkoutIntent'
import { apiProblem, clientWith, json, orderDto, requestAt } from './fixtures'

const rejection = async (promise: Promise<unknown>): Promise<unknown> => promise.then(() => undefined, (error: unknown) => error)

const noStorage: IntentStorage = { read: () => null, write: () => undefined, clear: () => undefined }

const serviceWith = (...responses: Array<Response | Error>) => {
  const { client, fetchImpl } = clientWith(...responses)
  const service = createRealOrderService(client, createRealAuthService(client), createCheckoutIntents(noStorage))
  return { service, fetchImpl }
}

const queryOf = (fetchImpl: ReturnType<typeof clientWith>['fetchImpl'], index = 0) =>
  Object.fromEntries(new URL(requestAt(fetchImpl, index).url, 'https://pwa.test').searchParams)

describe('historial real: filtros en el servidor antes de paginar', () => {
  it('envía q, estado y rango (días de la tienda en UTC-5, «hasta» exclusivo) con el cursor', async () => {
    const page = { items: [orderDto()], nextCursor: 'cursor_2' }
    const { service, fetchImpl } = serviceWith(json(page))
    const result = await service.listPage({ q: '  ord-1 ', status: 'delivered', from: '2026-10-01', to: '2026-10-02', limit: 20, cursor: 'cursor_1' })
    expect(result).toEqual(page)
    expect(new URL(requestAt(fetchImpl).url, 'https://pwa.test').pathname).toBe('/api/orders')
    expect(queryOf(fetchImpl)).toEqual({
      q: 'ord-1', status: 'delivered', limit: '20', cursor: 'cursor_1',
      from: '2026-10-01T05:00:00.000Z', to: '2026-10-03T05:00:00.000Z',
    })
  })

  it('sin filtros solo envía la paginación; los filtros vacíos no viajan', async () => {
    const { service, fetchImpl } = serviceWith(json({ items: [], nextCursor: null }))
    await service.listPage({ q: '   ', limit: 5 })
    expect(queryOf(fetchImpl)).toEqual({ limit: '5' })
  })

  it('no gasta red con filtros inválidos (rango invertido, fecha mal formada, texto fuera de límite, límite alto)', async () => {
    const { service, fetchImpl } = serviceWith()
    expect(await rejection(service.listPage({ from: '2026-10-05', to: '2026-10-01' }))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(service.listPage({ from: '02/10/2026' }))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(service.listPage({ q: 'x'.repeat(65) }))).toMatchObject({ kind: 'invalid_request' })
    expect(await rejection(service.listPage({ limit: 101 }))).toMatchObject({ kind: 'invalid_request' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('un estado desconocido no llega al servidor', async () => {
    const { service, fetchImpl } = serviceWith()
    // @ts-expect-error estado fuera del contrato: la validación compartida lo rechaza
    expect(await rejection(service.listPage({ status: 'inventado' }))).toMatchObject({ kind: 'invalid_request' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('un 401 se propaga para que la sesión se cierre; un 503 no se disfraza de lista vacía', async () => {
    const { service } = serviceWith(apiProblem(401, 'UNAUTHENTICATED', 'x'), apiProblem(503, 'SERVICE_UNAVAILABLE', 'x'))
    expect(await rejection(service.listPage())).toMatchObject({ kind: 'unauthenticated' })
    expect(await rejection(service.listPage())).toMatchObject({ kind: 'unavailable' })
  })
})
