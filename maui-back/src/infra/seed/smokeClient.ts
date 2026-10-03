import { DomainError } from '../../shared/errors.js'
import type { SmokeClient, SmokeResponse } from '../../usecases/seed/smoke.js'

const REQUEST_TIMEOUT_MS = 20_000

/**
 * Cliente HTTP del smoke: `SMOKE_BASE_URL` debe ser un origen limpio (https, o http en loopback), sin
 * credenciales, ruta ni query. `SMOKE_BYPASS_TOKEN` (protección de Preview) solo viaja en cabecera.
 */
export const createFetchSmokeClient = (env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): SmokeClient => {
  const raw = env.SMOKE_BASE_URL
  let origin: URL
  try {
    origin = new URL(raw ?? '')
  } catch {
    throw new DomainError('SMOKE_BASE_URL debe ser el origen de la API de test (https://host)', 'SMOKE_BASE_URL_INVALID')
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  const validScheme = origin.protocol === 'https:' || (origin.protocol === 'http:' && loopback)
  if (origin.origin !== raw || !validScheme || origin.username || origin.password) {
    throw new DomainError('SMOKE_BASE_URL debe ser un origen https limpio, sin ruta ni credenciales', 'SMOKE_BASE_URL_INVALID')
  }
  const bypass = env.SMOKE_BYPASS_TOKEN

  return {
    async request(method, path, init = {}): Promise<SmokeResponse> {
      const response = await fetchImpl(new URL(path, origin), {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          origin: origin.origin,
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(init.cookie ? { cookie: init.cookie } : {}),
          ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      })
      const text = await response.text()
      let json: unknown = null
      try {
        json = text === '' ? null : JSON.parse(text)
      } catch {
        json = null
      }
      const cookie = response.headers.getSetCookie()[0]?.split(';')[0]
      return { status: response.status, json, cookie }
    },
  }
}
