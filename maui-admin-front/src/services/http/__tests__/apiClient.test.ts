import { afterEach, describe, expect, it, vi } from 'vitest'
import { orderDtoSchema } from '@shared/contracts'
import { createApiClient } from '../apiClient'
import { ApiError, type ApiErrorKind } from '../apiError'
import { apiProblem, clientWith, json, noContent, orderDto, requestAt } from '../../real/__tests__/fixtures'

afterEach(() => { vi.useRealTimers() })

const failureOf = async (promise: Promise<unknown>): Promise<ApiError> => {
  const error = await promise.then(() => undefined, (rejected: unknown) => rejected)
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('transporte tipado', () => {
  it('usa /api same-origin con cookies, sin caché y query codificada', async () => {
    const { client, fetchImpl } = clientWith(json(orderDto()))
    await client.request({ path: '/orders/ord-1', query: { from: '2026-10-02T05:00:00.000+00:00', skip: undefined }, schema: orderDtoSchema })
    const sent = requestAt(fetchImpl)
    expect(sent.url).toBe('/api/orders/ord-1?from=2026-10-02T05%3A00%3A00.000%2B00%3A00')
    expect(sent).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' })
    expect(sent.headers.Accept).toBe('application/json')
    expect(sent.headers['Content-Type']).toBeUndefined()
  })

  it('serializa el cuerpo JSON y fija Content-Type', async () => {
    const { client, fetchImpl } = clientWith(noContent())
    await client.request({ method: 'POST', path: '/auth/logout', body: { a: 1 } })
    expect(requestAt(fetchImpl)).toMatchObject({ method: 'POST', body: { a: 1 }, headers: { 'Content-Type': 'application/json' } })
  })

  it.each<[number, string, ApiErrorKind]>([
    [400, 'VALIDATION_ERROR', 'validation'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'NOT_FOUND', 'not_found'],
    [409, 'CATEGORY_IN_USE', 'conflict'],
    [413, 'PAYLOAD_TOO_LARGE', 'payload_too_large'],
    [503, 'SERVICE_UNAVAILABLE', 'unavailable'],
    [500, 'INTERNAL_ERROR', 'server'],
  ])('traduce HTTP %i a un error explícito con el código del servidor', async (status, code, kind) => {
    const { client } = clientWith(apiProblem(status, code, 'Mensaje del servidor'))
    const error = await failureOf(client.request({ path: '/orders', schema: orderDtoSchema }))
    expect(error).toMatchObject({ kind, status, code, message: 'Mensaje del servidor' })
  })

  it('expone Retry-After en 429', async () => {
    const { client } = clientWith(apiProblem(429, 'RATE_LIMITED', 'Demasiados intentos', { 'Retry-After': '42' }))
    const error = await failureOf(client.request({ path: '/auth/login', method: 'POST', body: {} }))
    expect(error).toMatchObject({ kind: 'rate_limited', status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 42 })
  })

  it('usa un mensaje por defecto si el error no trae el envelope del contrato', async () => {
    const { client } = clientWith(new Response('<html>Bad gateway</html>', { status: 503 }))
    const error = await failureOf(client.request({ path: '/store/staff', schema: orderDtoSchema }))
    expect(error).toMatchObject({ kind: 'unavailable', code: undefined })
    expect(error.message).not.toContain('html')
  })

  it('rechaza un DTO inválido sin filtrar el cuerpo recibido', async () => {
    const { client } = clientWith(json({ ...orderDto(), customerName: 'Dato Privado', estimatedTotal: -1 }))
    const error = await failureOf(client.request({ path: '/orders/ord-1', schema: orderDtoSchema }))
    expect(error.kind).toBe('invalid_response')
    expect(error.issues.map((issue) => issue.path)).toContain('estimatedTotal')
    expect(JSON.stringify(error)).not.toContain('Dato Privado')
  })

  it('rechaza cuerpo no JSON y exige 204 cuando no hay esquema', async () => {
    const notJson = clientWith(new Response('no es json', { status: 200 }))
    expect((await failureOf(notJson.client.request({ path: '/orders/ord-1', schema: orderDtoSchema }))).kind).toBe('invalid_response')
    const withBody = clientWith(json({ ok: true }))
    expect((await failureOf(withBody.client.request({ method: 'DELETE', path: '/x' }))).kind).toBe('invalid_response')
  })

  it('distingue red caída, abort del llamador y timeout', async () => {
    const offline = clientWith(new TypeError('Failed to fetch https://secreto'))
    const networkError = await failureOf(offline.client.request({ path: '/orders' }))
    expect(networkError.kind).toBe('network')
    expect(networkError.message).not.toContain('secreto')

    const controller = new AbortController()
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const client = createApiClient({ fetchImpl, timeoutMs: 1000 })
    const aborted = failureOf(client.request({ path: '/orders', signal: controller.signal }))
    controller.abort()
    expect((await aborted).kind).toBe('aborted')

    vi.useFakeTimers()
    const slow = failureOf(client.request({ path: '/orders' }))
    await vi.advanceTimersByTimeAsync(1000)
    expect((await slow).kind).toBe('timeout')
  })

  it('no inicia la petición si la señal ya venía abortada', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => (init?.signal?.aborted
      ? Promise.reject(new DOMException('aborted', 'AbortError'))
      : Promise.resolve(noContent())))
    const error = await failureOf(createApiClient({ fetchImpl }).request({ path: '/orders', signal: controller.signal }))
    expect(error.kind).toBe('aborted')
  })
})
