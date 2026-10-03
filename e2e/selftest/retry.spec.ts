import { expect, test, type APIResponse } from '@playwright/test'
import { getWithRetry } from '../support/actors.js'

// Política de red del runner: un único reintento, solo ante cortes de red, nunca ante respuestas HTTP.
const response = (status: number) => ({ status: () => status }) as unknown as APIResponse
const requestThatFails = (failures: Error[], eventually: APIResponse) => {
  let calls = 0
  return { get: async () => { const failure = failures[calls]; calls += 1; if (failure) throw failure; return eventually }, calls: () => calls }
}

test.describe('reintento de GET', () => {
  test('reintenta una vez ante ECONNRESET y devuelve la respuesta', async () => {
    const request = requestThatFails([new Error('apiRequestContext.get: read ECONNRESET')], response(200))
    expect((await getWithRetry(request, '/x', {})).status()).toBe(200)
    expect(request.calls()).toBe(2)
  })

  test('como máximo dos intentos: el segundo corte se propaga', async () => {
    const request = requestThatFails([new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')], response(200))
    await expect(getWithRetry(request, '/x', {})).rejects.toThrow('ECONNRESET')
    expect(request.calls()).toBe(2)
  })

  test('no reintenta respuestas HTTP, ni siquiera 5xx o 401', async () => {
    for (const status of [401, 404, 500, 503]) {
      const request = requestThatFails([], response(status))
      expect((await getWithRetry(request, '/x', {})).status()).toBe(status)
      expect(request.calls()).toBe(1)
    }
  })

  test('no reintenta errores que no son cortes de red', async () => {
    const request = requestThatFails([new Error('Target page, context or browser has been closed')], response(200))
    await expect(getWithRetry(request, '/x', {})).rejects.toThrow('closed')
    expect(request.calls()).toBe(1)
  })
})
