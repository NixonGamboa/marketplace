import type { VercelRequest, VercelResponse } from '@vercel/node'
import { toOrderDto } from '../../maui-back/src/domain/orders/orderMappers.js'
import { getAuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import type { AuthConfig } from '../../maui-back/src/infra/auth/config.js'
import { getRepositories } from '../../maui-back/src/infra/factory.js'
import { getOrderForActor } from '../../maui-back/src/usecases/orders/getOrder.js'
import { allowMethods, failAuth, prepareAuthResponse } from '../_lib/auth.js'
import { authorizeOrderRequest, orderIdFrom } from '../_lib/orders.js'
import { ok } from '../_lib/response.js'

/** GET /api/orders/:id — cliente dueño o personal de la tienda; lo ajeno responde 404. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareAuthResponse(res)
  if (!allowMethods(req, res, ['GET'])) return

  let config: AuthConfig | undefined
  try {
    const runtime = await getAuthRuntime()
    config = runtime.config
    const actor = await authorizeOrderRequest(req, runtime, { mutation: false })
    const id = orderIdFrom(req)
    const { orders } = await getRepositories()
    ok(res, toOrderDto(await getOrderForActor({ orders }, actor, id)))
  } catch (err) {
    failAuth(res, err, config)
  }
}
