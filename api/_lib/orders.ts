import type { VercelRequest } from '@vercel/node'
import { entityIdSchema, issuesFromZodError } from '../../shared/contracts/index.js'
import type { OrderActor } from '../../maui-back/src/domain/orders/orderAccess.js'
import type { AuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import { ValidationError } from '../../maui-back/src/shared/errors.js'
import { AuthRequestError, authenticateRequest, requireTrustedOrigin } from './auth.js'

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

export const orderIdFrom = (req: VercelRequest): string => {
  const raw = typeof req.query.id === 'string' ? req.query.id : req.query.id?.[0]
  if (!raw) throw new AuthRequestError(400, 'MISSING_ID', 'Falta el ID del pedido')
  const parsed = entityIdSchema.safeParse(raw)
  if (!parsed.success) throw new ValidationError('Invalid order id', issuesFromZodError(parsed.error))
  return parsed.data
}
