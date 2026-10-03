import { ApiError, apiErrorFromResponse, defaultMessageFor, validRequestId } from './apiError'
import { telemetryEndpoint, type ApiErrorTelemetry } from './telemetry'
import { notifySessionExpired } from './sessionExpiry'

/** Esquema estructural (compatible con Zod) para no acoplar el transporte a la librería. */
export interface ResponseSchema<T> {
  safeParse(data: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> } }
}

export type QueryValue = string | number | boolean | undefined

export interface ApiRequest<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** Ruta relativa a la base (`/auth/login`); los parámetros van en `query`. */
  path: string
  query?: Readonly<Record<string, QueryValue>>
  body?: unknown
  headers?: Readonly<Record<string, string>>
  /** Esquema del cuerpo de éxito. Sin esquema la respuesta debe ser 204 sin cuerpo. */
  schema?: ResponseSchema<T>
  signal?: AbortSignal
  timeoutMs?: number
}

export interface ApiClientOptions {
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** Se invoca ante un 401 de una ruta que no es de `/auth/` (sesión vencida o revocada). */
  onUnauthenticated?: () => void
  /** Solo campos saneados; el callback no recibe cuerpos, errores originales ni query. */
  onError?: (event: ApiErrorTelemetry) => void
}

export interface ApiClient {
  request<T = void>(request: ApiRequest<T>): Promise<T>
}

/** Mismo origen: las cookies HttpOnly de sesión viajan sin exponer tokens a JavaScript. */
export const API_BASE_URL = '/api'
export const DEFAULT_TIMEOUT_MS = 15_000

const buildUrl = (baseUrl: string, path: string, query: ApiRequest<unknown>['query']): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  const search = params.toString()
  return `${baseUrl}${path}${search ? `?${search}` : ''}`
}

/** Combina la señal del llamador y el timeout; distingue cuál abortó. */
const withAbort = (external: AbortSignal | undefined, timeoutMs: number) => {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onExternalAbort = () => controller.abort()
  if (external?.aborted) controller.abort()
  else external?.addEventListener('abort', onExternalAbort, { once: true })
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  }
}

const invalidResponse = (status: number, issues?: { path: string; message: string }[]): ApiError =>
  new ApiError({ kind: 'invalid_response', status, message: defaultMessageFor('invalid_response'), ...(issues ? { issues } : {}) })

const readSuccessBody = async <T>(response: Response, schema: ResponseSchema<T> | undefined): Promise<T> => {
  if (schema === undefined) {
    if (response.status !== 204) throw invalidResponse(response.status)
    return undefined as T
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw invalidResponse(response.status)
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    // Solo ruta y mensaje de validación: nunca el cuerpo, que puede incluir datos personales.
    throw invalidResponse(
      response.status,
      parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    )
  }
  return parsed.data
}

export const createApiClient = (options: ApiClientOptions = {}): ApiClient => {
  const baseUrl = options.baseUrl ?? API_BASE_URL
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async request<T = void>(request: ApiRequest<T>): Promise<T> {
      const doFetch = options.fetchImpl ?? fetch
      const abort = withAbort(request.signal, request.timeoutMs ?? defaultTimeout)
      const start = performance.now()
      let requestId = crypto.randomUUID() as string
      const headers: Record<string, string> = { Accept: 'application/json', ...request.headers }
      for (const name of Object.keys(headers)) if (name.toLowerCase() === 'x-request-id') delete headers[name]
      headers['X-Request-Id'] = requestId
      if (request.body !== undefined) headers['Content-Type'] = 'application/json'

      try {
        const response = await doFetch(buildUrl(baseUrl, request.path, request.query), {
          method: request.method ?? 'GET',
          credentials: 'same-origin',
          // Datos privados por sesión: nunca desde ni hacia la caché HTTP del navegador.
          cache: 'no-store',
          headers,
          signal: abort.signal,
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        })
        const responseId = response.headers.get('X-Request-Id')
        if (validRequestId(responseId)) requestId = responseId
        if (!response.ok) throw await apiErrorFromResponse(response)
        return await readSuccessBody(response, request.schema)
      } catch (error) {
        const failure = error instanceof ApiError ? new ApiError({ kind: error.kind, message: error.message,
          ...(error.status !== undefined ? { status: error.status } : {}),
          ...(error.code !== undefined ? { code: error.code } : {}), issues: error.issues,
          ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}), requestId })
          : new ApiError({ kind: abort.timedOut() ? 'timeout' : abort.signal.aborted ? 'aborted' : 'network',
            message: defaultMessageFor(abort.timedOut() ? 'timeout' : abort.signal.aborted ? 'aborted' : 'network'), requestId })
        if (failure.kind !== 'aborted') {
          const event: ApiErrorTelemetry = { event: 'client_api_error', client: 'pwa', endpoint: telemetryEndpoint(request.path),
            method: request.method ?? 'GET', kind: failure.kind, status: failure.status, requestId, durationMs: Math.round(performance.now() - start) }
          try { (options.onError ?? ((entry) => console.warn(JSON.stringify(entry))))(event) } catch { /* Telemetría no cambia el resultado del transporte. */ }
        }
        // En `/auth/*` un 401 es «credenciales inválidas» o «sin sesión», no una sesión que venció.
        if (failure.kind === 'unauthenticated' && !request.path.startsWith('/auth/')) options.onUnauthenticated?.()
        throw failure
      } finally {
        abort.dispose()
      }
    },
  }
}

/** Cliente compartido de los repositories reales. */
export const apiClient: ApiClient = createApiClient({ onUnauthenticated: notifySessionExpired })
