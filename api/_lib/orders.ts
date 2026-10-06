import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  CONTRACT_VERSION_HEADER,
  buildApiError,
  contractVersionFrom,
  entityIdSchema,
  issuesFromZodError,
  listOrdersQuerySchema,
  type ContractVersion,
  type ListOrdersQuery,
} from '../../shared/contracts/index.js'
import { CatalogPersistenceError } from '../../maui-back/src/domain/catalog/errors.js'
import type { OrderActor } from '../../maui-back/src/domain/orders/orderAccess.js'
import { OrderPersistenceError } from '../../maui-back/src/domain/orders/orderCreation.js'
import type { AuthConfig } from '../../maui-back/src/infra/auth/config.js'
import type { AuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import { ValidationError } from '../../maui-back/src/shared/errors.js'
import { AuthRequestError, authenticateRequest, failAuth, prepareAuthResponse, requireTrustedOrigin } from './auth.js'
import { jsonResponse } from './response.js'

/**
 * Cabeceras comunes de pedidos: sin caché y variación por la cabecera de contrato, porque la misma URL
 * responde v1 o v2 según la app que la pide (`contractVersionFrom`).
 */
export const prepareOrderResponse = (res: VercelResponse): void => {
  prepareAuthResponse(res)
  res.setHeader('Vary', `Cookie, Origin, ${CONTRACT_VERSION_HEADER}`)
}

/** Contrato que entiende la app: las anteriores no envían la cabecera y reciben la forma v1. */
export const contractVersionOf = (req: VercelRequest): ContractVersion =>
  contractVersionFrom(req.headers[CONTRACT_VERSION_HEADER.toLowerCase()])

/** Tope del cuerpo JSON de pedidos: 50 ítems con snapshot y dirección caben con holgura. */
export const MAX_ORDER_BODY_BYTES = 32 * 1024

/**
 * Actor de la request: cuenta vigente de la sesión por cookie, con rol y tienda leídos de BD.
 * Las mutaciones exigen el origen configurado antes de tocar la sesión (CSRF). Ninguna
 * cabecera, body ni ID aporta identidad.
 */
export const authorizeOrderRequest = async (
  req: VercelRequest,
  runtime: AuthRuntime,
  { mutation }: { mutation: boolean },
): Promise<OrderActor> => {
  if (mutation) requireTrustedOrigin(req, runtime.config)
  const { account } = await authenticateRequest(req, runtime)
  return account
}

/** Query del listado validada por el contrato compartido: sin parámetros desconocidos, repetidos ni coerciones. */
export const listQueryFrom = (req: VercelRequest): ListOrdersQuery => {
  const parsed = listOrdersQuerySchema.safeParse(req.query ?? {})
  if (!parsed.success) throw new ValidationError('Invalid query', issuesFromZodError(parsed.error))
  return parsed.data
}

/**
 * Errores de pedidos: fallo de persistencia de pedidos o del catálogo leído para sustituir → 503
 * sin detalles; el resto sigue la política de auth/API (conflicto de versión → 409).
 */
export const failOrderRequest = (res: VercelResponse, err: unknown, config?: AuthConfig): void => {
  if (err instanceof OrderPersistenceError || err instanceof CatalogPersistenceError) {
    jsonResponse(res, buildApiError('SERVICE_UNAVAILABLE', 'Servicio no disponible'), 503)
    return
  }
  failAuth(res, err, config)
}

export const orderIdFrom =(req: VercelRequest): string => {
  const raw = typeof req.query.id === 'string' ? req.query.id : req.query.id?.[0]
  if (!raw) throw new AuthRequestError(400, 'MISSING_ID', 'Falta el ID del pedido')
  const parsed = entityIdSchema.safeParse(raw)
  if (!parsed.success) throw new ValidationError('Invalid order id', issuesFromZodError(parsed.error))
  return parsed.data
}
