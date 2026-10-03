import { withObservability } from '../_lib/observability.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { DEFAULT_STORE_ID } from '../../maui-back/src/domain/orders/Order.js'
import { toOrderConfirmation, toOrderListResponse } from '../../maui-back/src/domain/orders/orderMappers.js'
import { getAuthRuntime, type AuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import { getRepositories } from '../../maui-back/src/infra/factory.js'
import { createOrder } from '../../maui-back/src/usecases/orders/createOrder.js'
import { recordOrderOutcome } from '../../maui-back/src/shared/observability.js'
import { listOrdersForActor } from '../../maui-back/src/usecases/orders/listOrders.js'
import { allowMethods, prepareAuthResponse, readJsonBody } from '../_lib/auth.js'
import { MAX_ORDER_BODY_BYTES, authorizeOrderRequest, failOrderRequest, listQueryFrom } from '../_lib/orders.js'
import { ok } from '../_lib/response.js'

/** GET: listado histórico; la sesión fija el alcance. Lectura: no exige Origin (solo las mutaciones). */
const listOrders = async (req: VercelRequest, res: VercelResponse, runtime: AuthRuntime): Promise<void> => {
  const actor = await authorizeOrderRequest(req, runtime, { mutation: false })
  const query = listQueryFrom(req)
  const { orders } = await getRepositories()
  ok(res, toOrderListResponse(await listOrdersForActor({ orders }, actor, query)))
}

/** POST: solo cliente autenticado; dueño y tienda los fija el servidor. */
const placeOrder = async (req: VercelRequest, res: VercelResponse, runtime: AuthRuntime): Promise<void> => {
  const actor = await authorizeOrderRequest(req, runtime, { mutation: true })
  const body = readJsonBody(req, MAX_ORDER_BODY_BYTES)
  const { orders, catalog, store } = await getRepositories()
  const created = await createOrder(
    { orders, catalog, store, clock: runtime.deps.clock, keys: runtime.deps.keys, onCreationOutcome: recordOrderOutcome },
    actor,
    body,
    { storeId: DEFAULT_STORE_ID },
    req.headers['idempotency-key'],
  )
  ok(res, toOrderConfirmation(created), 201)
}

/**
 * /api/orders — GET lista pedidos del actor (cliente: los suyos; owner/operator: su tienda);
 * POST crea un pedido propio del cliente.
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareAuthResponse(res)
  if (!allowMethods(req, res, ['GET', 'POST'])) return

  let runtime: AuthRuntime | undefined
  try {
    runtime = await getAuthRuntime()
    await (req.method === 'GET' ? listOrders : placeOrder)(req, res, runtime)
  } catch (err) {
    failOrderRequest(res, err, runtime?.config)
  }
}

export default withObservability('/api/orders', handler)
