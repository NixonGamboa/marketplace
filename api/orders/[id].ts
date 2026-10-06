import { withObservability } from '../_lib/observability.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { toOrderDtoFor } from '../../maui-back/src/domain/orders/orderMappers.js'
import { getAuthRuntime, type AuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import { getRepositories } from '../../maui-back/src/infra/factory.js'
import { getOrderForActor } from '../../maui-back/src/usecases/orders/getOrder.js'
import { updateOrderItems } from '../../maui-back/src/usecases/orders/updateOrderItems.js'
import { allowMethods, readJsonBody } from '../_lib/auth.js'
import { MAX_ORDER_BODY_BYTES, authorizeOrderRequest, contractVersionOf, failOrderRequest, orderIdFrom, prepareOrderResponse } from '../_lib/orders.js'
import { ok } from '../_lib/response.js'

/** GET: cliente dueño o personal de la tienda; lo ajeno responde 404. Lectura: no exige Origin. */
const readOrder = async (req: VercelRequest, res: VercelResponse, runtime: AuthRuntime): Promise<void> => {
  const actor = await authorizeOrderRequest(req, runtime, { mutation: false })
  const id = orderIdFrom(req)
  const { orders } = await getRepositories()
  ok(res, toOrderDtoFor(await getOrderForActor({ orders }, actor, id), contractVersionOf(req)))
}

/** PATCH: pesos reales, marcas de alistado, sustituciones y retiro de ítems (T-12, ME-03); solo personal de la tienda del pedido. */
const changeItems = async (req: VercelRequest, res: VercelResponse, runtime: AuthRuntime): Promise<void> => {
  const actor = await authorizeOrderRequest(req, runtime, { mutation: true })
  const id = orderIdFrom(req)
  const body = readJsonBody(req, MAX_ORDER_BODY_BYTES)
  const { orders, catalog } = await getRepositories()
  ok(res, toOrderDtoFor(await updateOrderItems({ orders, catalog, clock: runtime.deps.clock }, actor, id, body), contractVersionOf(req)))
}

/** /api/orders/:id — GET detalle; PATCH cambios de ítems con `expectedVersion`. */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareOrderResponse(res)
  if (!allowMethods(req, res, ['GET', 'PATCH'])) return

  let runtime: AuthRuntime | undefined
  try {
    runtime = await getAuthRuntime()
    await (req.method === 'GET' ? readOrder : changeItems)(req, res, runtime)
  } catch (err) {
    failOrderRequest(res, err, runtime?.config)
  }
}

export default withObservability('/api/orders/[id]', handler)
