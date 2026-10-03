import { apiErrorSchema, type ContractIssue } from '@shared/contracts'

/** Causa de un fallo del transporte; la UI decide la reacción según `kind`, no según el texto. */
export type ApiErrorKind =
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'rate_limited'
  | 'unavailable'
  | 'server'
  | 'http'
  | 'timeout'
  | 'aborted'
  | 'network'
  | 'invalid_response'
  | 'invalid_request'

export interface ApiErrorInit {
  kind: ApiErrorKind
  message: string
  status?: number
  code?: string
  issues?: readonly ContractIssue[]
  retryAfterSeconds?: number
  requestId?: string
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined
  /** Código estable del servidor (`CATEGORY_IN_USE`, `RATE_LIMITED`, …) cuando llegó el envelope. */
  readonly code: string | undefined
  readonly issues: readonly ContractIssue[]
  readonly retryAfterSeconds: number | undefined
  readonly requestId: string | undefined

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status
    this.code = init.code
    this.issues = init.issues ?? []
    this.retryAfterSeconds = init.retryAfterSeconds
    this.requestId = validRequestId(init.requestId) ? init.requestId : undefined
  }
}

export const validRequestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/.test(value)

const KIND_BY_STATUS: Readonly<Record<number, ApiErrorKind>> = {
  400: 'validation',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'rate_limited',
  503: 'unavailable',
}

const DEFAULT_MESSAGES: Readonly<Record<ApiErrorKind, string>> = {
  validation: 'La solicitud no es válida.',
  unauthenticated: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  forbidden: 'No tienes permiso para esta acción.',
  not_found: 'El recurso ya no está disponible.',
  conflict: 'El recurso cambió. Recarga e intenta de nuevo.',
  payload_too_large: 'El contenido enviado es demasiado grande.',
  rate_limited: 'Demasiados intentos. Intenta más tarde.',
  unavailable: 'El servicio no está disponible. Intenta más tarde.',
  server: 'Error del servidor. Intenta más tarde.',
  http: 'No se pudo completar la solicitud.',
  timeout: 'La solicitud tardó demasiado. Comprueba el estado antes de reintentar.',
  aborted: 'La solicitud fue cancelada.',
  network: 'No hay conexión con el servidor.',
  invalid_response: 'Respuesta inesperada del servidor. Recarga e intenta de nuevo.',
  invalid_request: 'Los datos no son válidos.',
}

export const defaultMessageFor = (kind: ApiErrorKind): string => DEFAULT_MESSAGES[kind]

export const kindForStatus = (status: number): ApiErrorKind =>
  KIND_BY_STATUS[status] ?? (status >= 500 ? 'server' : 'http')

const parseRetryAfter = (value: string | null): number | undefined => {
  if (value === null || !/^\d{1,7}$/.test(value.trim())) return undefined
  return Number(value)
}

/**
 * Traduce una respuesta no exitosa. Usa el envelope `{ error, message, issues? }` del contrato
 * si el cuerpo lo cumple; si no (HTML de plataforma, cuerpo vacío) cae en el mensaje por estado.
 */
export const apiErrorFromResponse = async (response: Response): Promise<ApiError> => {
  const kind = kindForStatus(response.status)
  const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'))
  let envelope: ReturnType<typeof apiErrorSchema.safeParse> | undefined
  try {
    envelope = apiErrorSchema.safeParse(await response.json())
  } catch {
    envelope = undefined
  }
  const body = envelope?.success ? envelope.data : undefined
  const init: ApiErrorInit = {
    kind,
    status: response.status,
    message: body?.message ?? defaultMessageFor(kind),
  }
  const requestId = response.headers.get('X-Request-Id')
  if (validRequestId(requestId)) init.requestId = requestId
  if (body) {
    init.code = body.error
    if (body.issues) init.issues = body.issues
  }
  if (retryAfterSeconds !== undefined) init.retryAfterSeconds = retryAfterSeconds
  return new ApiError(init)
}
