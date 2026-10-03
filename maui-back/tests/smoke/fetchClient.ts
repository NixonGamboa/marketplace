import type { ContentionClient, ContentionResponse } from './contention.js'

const REQUEST_TIMEOUT_MS = 30_000

const cleanOrigin = (raw: string | undefined, name: string): URL => {
  let url: URL
  try {
    url = new URL(raw ?? '')
  } catch {
    throw new Error(`${name} debe ser un origen limpio (https://host)`)
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.origin !== raw || url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    throw new Error(`${name} debe ser un origen https limpio, sin ruta ni credenciales`)
  }
  return url
}

/**
 * Cliente `fetch` del smoke de contención. Mismas variables que el smoke de lectura: `SMOKE_BASE_URL`,
 * `SMOKE_AUTH_ORIGIN` (u `AUTH_ORIGIN`) y `SMOKE_BYPASS_TOKEN` (solo viaja en cabecera).
 */
export function createContentionFetchClient(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): ContentionClient {
  const base = cleanOrigin(env.SMOKE_BASE_URL, 'SMOKE_BASE_URL')
  const authOrigin = cleanOrigin(env.SMOKE_AUTH_ORIGIN ?? env.AUTH_ORIGIN ?? env.SMOKE_BASE_URL, 'SMOKE_AUTH_ORIGIN')
  return {
    async request(method, path, init = {}): Promise<ContentionResponse> {
      const response = await fetchImpl(new URL(path, base), {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          origin: authOrigin.origin,
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(init.cookie ? { cookie: init.cookie } : {}),
          ...(env.SMOKE_BYPASS_TOKEN ? { 'x-vercel-protection-bypass': env.SMOKE_BYPASS_TOKEN } : {}),
          ...init.headers,
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
      return {
        status: response.status,
        json,
        cookie: response.headers.getSetCookie()[0]?.split(';')[0],
        retryAfter: response.headers.get('retry-after') ?? undefined,
      }
    },
  }
}
