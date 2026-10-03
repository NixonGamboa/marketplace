import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../apiClient'
import { ApiError } from '../apiError'
import { telemetryEndpoint } from '../telemetry'

describe('correlación de errores del cliente', () => {
  it('captura requestID servidor y emite metadata saneada ante HTTP503', async () => {
    const onError = vi.fn()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible' }), { status: 503, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'request-server-123' } }))
    const client = createApiClient({ fetchImpl, onError })
    const failure = await client.request({ path: '/orders/private-id', query: { phone: 'private' }, body: { password: 'private' }, method: 'PATCH' }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ requestId: 'request-server-123', kind: 'unavailable' })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ event: 'client_api_error', endpoint: '/orders/:id', status: 503, requestId: 'request-server-123' }))
    expect(JSON.stringify(onError.mock.calls)).not.toContain('private')
  })
  it('correlaciona fallos de red y no incluye mensaje ni URL original', async () => {
    const onError = vi.fn()
    const client = createApiClient({ onError, fetchImpl: async () => { throw new Error('https://secret@private?phone=private') } })
    const failure = await client.request({ path: '/orders' }).catch((error: unknown) => error)
    expect(failure).toMatchObject({ kind: 'network', requestId: expect.stringMatching(/^[a-f0-9-]{36}$/) })
    expect(JSON.stringify(onError.mock.calls)).not.toMatch(/secret|private|phone/)
    expect(telemetryEndpoint('/arbitrary/private?token=secret')).toBe('/unknown')
  })
})
