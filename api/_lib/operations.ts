import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildApiError, entityIdSchema, issuesFromZodError } from '../../shared/contracts/index.js'
import { CatalogPersistenceError } from '../../maui-back/src/domain/catalog/errors.js'
import { StorePersistenceError } from '../../maui-back/src/domain/store/errors.js'
import type { StoreActor } from '../../maui-back/src/domain/store/storeAccess.js'
import type { AuthConfig } from '../../maui-back/src/infra/auth/config.js'
import { getAuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import { ValidationError } from '../../maui-back/src/shared/errors.js'
import {
  AuthRequestError,
  allowMethods,
  authenticateRequest,
  failAuth,
  prepareAuthResponse,
  requireTrustedOrigin,
} from './auth.js'
import { jsonResponse } from './response.js'

/** Tope del cuerpo JSON de catálogo/tienda: un producto completo o la configuración pesan < 4 KB. */
export const MAX_CATALOG_BODY_BYTES = 16 * 1024

export type OperationMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface OperationContext {
  req: VercelRequest
  res: VercelResponse
  /**
   * Cuenta vigente de la sesión (rol y tienda leídos de BD). Las mutaciones exigen antes el
   * `Origin` configurado (CSRF). Ningún body, cabecera ni ID aporta identidad o tienda.
   */
  sessionActor(options: { mutation: boolean }): Promise<StoreActor>
}

export type OperationHandler = (context: OperationContext) => Promise<void>

export type OperationRoutes<Operation extends string> = Record<
  Operation,
  Partial<Record<OperationMethod, OperationHandler>>
>

/** Un valor único de query; `null` si llega repetido (p. ej. `?id=a&id=b`), que no se adivina. */
const singleQueryValue = (req: VercelRequest, key: string): string | undefined | null => {
  const value = req.query?.[key]
  if (value === undefined) return undefined
  return typeof value === 'string' ? value : null
}

/** ID de la ruta (`/products/:id`, `/categories/:id`), que llega por el rewrite como `id`. */
export const routeIdFrom = (req: VercelRequest): string => {
  const raw = singleQueryValue(req, 'id')
  if (raw === undefined || raw === '') throw new AuthRequestError(400, 'MISSING_ID', 'Falta el ID')
  const parsed = entityIdSchema.safeParse(raw)
  if (!parsed.success) throw new ValidationError('Invalid id', issuesFromZodError(parsed.error))
  return parsed.data
}

const failOperation = (res: VercelResponse, err: unknown, config: AuthConfig | undefined): void => {
  if (err instanceof CatalogPersistenceError || err instanceof StorePersistenceError) {
    jsonResponse(res, buildApiError('SERVICE_UNAVAILABLE', 'Servicio no disponible'), 503)
    return
  }
  failAuth(res, err, config)
}

/**
 * Una Function por recurso con dispatch tipado. Vercel reescribe cada ruta REST a
 * `?op=<operación>` (ver `vercel.json`); sin `op` se atiende la operación por defecto.
 * Una operación desconocida o repetida responde el mismo 404 JSON que una ruta inexistente,
 * y un método no declarado, 405 con `Allow`. Todas las respuestas son `no-store`.
 */
export const createOperationHandler =
  <Operation extends string>(routes: OperationRoutes<Operation>, defaultOperation: NoInfer<Operation>) =>
  async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    prepareAuthResponse(res)

    const requested = singleQueryValue(req, 'op')
    const operation = requested === undefined ? defaultOperation : requested
    const methods = operation !== null && Object.hasOwn(routes, operation) ? routes[operation as Operation] : undefined
    if (!methods) {
      jsonResponse(res, buildApiError('NOT_FOUND', 'Ruta API no encontrada'), 404)
      return
    }
    if (!allowMethods(req, res, Object.keys(methods))) return
    const run = methods[req.method as OperationMethod]
    if (!run) return

    let config: AuthConfig | undefined
    const context: OperationContext = {
      req,
      res,
      async sessionActor({ mutation }) {
        const runtime = await getAuthRuntime()
        config = runtime.config
        if (mutation) requireTrustedOrigin(req, runtime.config)
        return (await authenticateRequest(req, runtime)).account
      },
    }

    try {
      await run(context)
    } catch (err) {
      failOperation(res, err, config)
    }
  }
