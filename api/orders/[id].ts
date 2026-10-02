import type { VercelRequest, VercelResponse } from '@vercel/node'
import { toOrderDto } from '../../maui-back/src/domain/orders/orderMappers.js'
import { getAuthRuntime, type AuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import { getRepositories } from '../../maui-back/src/infra/factory.js'
import { getOrderForActor } from '../../maui-back/src/usecases/orders/getOrder.js'
import { updateOrderItems } from '../../maui-back/src/usecases/orders/updateOrderItems.js'
import { allowMethods, prepareAuthResponse, readJsonBody } from '../_lib/auth.js'
import { MAX_ORDER_BODY_BYTES, authorizeOrderRequest, failOrderRequest, orderIdFrom } from '../_lib/orders.js'
import { ok } from '../_lib/response.js'

/** GET: cliente dueño o personal de la tienda; lo ajeno responde 404. Lectura: no exige Origin. */
const readOrder = async (req: VercelRequest, res: VercelResponse, runtime: AuthRuntime): Promise<void> => {
  const actor = await authorizeOrderRequest(req, runtime, { mutation: false })
  const id = orderIdFrom(req)
  const { orders } = await getRepositories()
  ok(res, toOrderDto(await getOrderForActor({ orders }, actor, id)))
}

/** PATCH: pesos reales, sustituciones y retiro de ítems (T-12); solo personal de la tienda del pedido. */
const changeItems = async (req: VercelRequest, res: VercelResponse, runtime: AuthRuntime): Promise<void> => {
  const actor = await authorizeOrderRequest(req, runtime, { mutation: true })
  const id = orderIdFrom(req)
  const body = readJsonBody(req, MAX_ORDER_BODY_BYTES)
  const { orders, catalog } = await getRepositories()
  ok(res, toOrderDto(await updateOrderItems({ orders, catalog, clock: runtime.deps.clock }, actor, id, body)))
}

/** /api/orders/:id — GET detalle; PATCH cambios de ítems con `expectedVersion`. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareAuthResponse(res)
  if (!allowMethods(req, res, ['GET', 'PATCH'])) return

  let runtime: AuthRuntime | undefined
  try {
    runtime = await getAuthRuntime()
    await (req.method === 'GET' ? readOrder : changeItems)(req, res, runtime)
  } catch (err) {
    failOrderRequest(res, err, runtime?.config)
  }
}
