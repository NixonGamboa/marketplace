import type { VercelRequest, VercelResponse } from '@vercel/node'
import { DEFAULT_STORE_ID } from '../../maui-back/src/domain/orders/Order.js'
import { toOrderConfirmation } from '../../maui-back/src/domain/orders/orderMappers.js'
import { getAuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import type { AuthConfig } from '../../maui-back/src/infra/auth/config.js'
import { getRepositories } from '../../maui-back/src/infra/factory.js'
import { createOrder } from '../../maui-back/src/usecases/orders/createOrder.js'
import { allowMethods, failAuth, prepareAuthResponse, readJsonBody } from '../_lib/auth.js'
import { MAX_ORDER_BODY_BYTES, authorizeOrderRequest } from '../_lib/orders.js'
import { ok } from '../_lib/response.js'

/** POST /api/orders — solo cliente autenticado; dueño y tienda los fija el servidor. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareAuthResponse(res)
  if (!allowMethods(req, res, ['POST'])) return

  let config: AuthConfig | undefined
  try {
    const runtime = await getAuthRuntime()
    config = runtime.config
    const actor = await authorizeOrderRequest(req, runtime, { mutation: true })
    const body = readJsonBody(req, MAX_ORDER_BODY_BYTES)
    const { orders, catalog, store } = await getRepositories()
    const created = await createOrder(
      { orders, catalog, store, clock: runtime.deps.clock, keys: runtime.deps.keys },
      actor,
      body,
      { storeId: DEFAULT_STORE_ID },
      req.headers['idempotency-key'],
    )
    ok(res, toOrderConfirmation(created), 201)
  } catch (err) {
    failAuth(res, err, config)
  }
}
