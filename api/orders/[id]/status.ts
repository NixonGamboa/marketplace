import { withObservability } from '../../_lib/observability.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { toOrderDtoFor } from '../../../maui-back/src/domain/orders/orderMappers.js'
import { getAuthRuntime, type AuthRuntime } from '../../../maui-back/src/infra/auth/factory.js'
import { getRepositories } from '../../../maui-back/src/infra/factory.js'
import { updateOrderStatus } from '../../../maui-back/src/usecases/orders/updateOrderStatus.js'
import { allowMethods, readJsonBody } from '../../_lib/auth.js'
import { authorizeOrderRequest, contractVersionOf, failOrderRequest, orderIdFrom, prepareOrderResponse } from '../../_lib/orders.js'
import { ok } from '../../_lib/response.js'

/**
 * PATCH /api/orders/:id/status — transición con `expectedVersion` (cancelar exige `reason`; `ready` →
 * `preparing` reabre la preparación); owner/operator de la tienda del pedido.
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareOrderResponse(res)
  if (!allowMethods(req, res, ['PATCH'])) return

  let runtime: AuthRuntime | undefined
  try {
    runtime = await getAuthRuntime()
    const actor = await authorizeOrderRequest(req, runtime, { mutation: true })
    const id = orderIdFrom(req)
    const body = readJsonBody(req)
    const { orders } = await getRepositories()
    ok(res, toOrderDtoFor(await updateOrderStatus({ orders, clock: runtime.deps.clock }, actor, id, body), contractVersionOf(req)))
  } catch (err) {
    failOrderRequest(res, err, runtime?.config)
  }
}

export default withObservability('/api/orders/[id]/status', handler)
