import type { VercelRequest } from '@vercel/node'
import { randomBytes } from 'node:crypto'
import { vi } from 'vitest'

export const HTTP_SECRET = randomBytes(32).toString('base64')
export const HTTP_ORIGIN = 'http://localhost:5173'

interface RequestOptions {
  method?: string
  headers?: Record<string, string | undefined>
  body?: unknown
  /** Simula el getter de Vercel, que lanza ante JSON inválido. */
  bodyThrows?: boolean
  /** Por defecto se declara el tamaño real del body serializado. */
  contentLength?: number
}

/** Request de Vercel mínima. Por defecto: JSON desde el origen configurado. */
export function authRequest(options: RequestOptions = {}): VercelRequest {
  const { method = 'POST', body, bodyThrows = false } = options
  const serialized = body === undefined ? undefined : JSON.stringify(body)
  const headers: Record<string, string | undefined> = {
    origin: HTTP_ORIGIN,
    'content-type': 'application/json',
    ...(serialized === undefined ? {} : { 'content-length': String(options.contentLength ?? Buffer.byteLength(serialized)) }),
    ...options.headers,
  }
  for (const key of Object.keys(headers)) {
    if (headers[key] === undefined) delete headers[key]
  }

  const req = { method, headers } as Record<string, unknown>
  if (bodyThrows) {
    Object.defineProperty(req, 'body', {
      get() {
        throw new Error('Invalid JSON')
      },
    })
  } else {
    req.body = body
  }
  return req as unknown as VercelRequest
}

export function mockResponse() {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() }
  res.status.mockReturnValue(res)
  return res
}

export type MockResponse = ReturnType<typeof mockResponse>

export const statusOf = (res: MockResponse): number => res.status.mock.calls[0]?.[0] as number

export const bodyOf = (res: MockResponse): unknown => res.json.mock.calls[0]?.[0]

/** Última cabecera escrita con ese nombre (sin distinguir mayúsculas). */
export function headerOf(res: MockResponse, name: string): string | undefined {
  const calls = res.setHeader.mock.calls.filter(([key]) => String(key).toLowerCase() === name.toLowerCase())
  return calls.at(-1)?.[1] as string | undefined
}

export function headerNames(res: MockResponse): string[] {
  return res.setHeader.mock.calls.map(([key]) => String(key).toLowerCase())
}

/** `nombre=valor` de la cookie fijada, lista para reenviarse en la cabecera Cookie. */
export function cookiePair(res: MockResponse): string {
  const setCookie = headerOf(res, 'Set-Cookie')
  if (!setCookie) throw new Error('No hay Set-Cookie')
  return setCookie.split(';')[0] as string
}
