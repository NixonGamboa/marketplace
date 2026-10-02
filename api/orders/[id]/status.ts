import type { VercelRequest, VercelResponse } from '@vercel/node'
import { issuesFromZodError, updateOrderStatusRequestSchema } from '../../../shared/contracts/index.js'
import { toOrderDto } from '../../../maui-back/src/domain/orders/orderMappers.js'
import { getAuthRuntime } from '../../../maui-back/src/infra/auth/factory.js'
import type { AuthConfig } from '../../../maui-back/src/infra/auth/config.js'
import { getRepositories } from '../../../maui-back/src/infra/factory.js'
import { ValidationError } from '../../../maui-back/src/shared/errors.js'
import { updateOrderStatus } from '../../../maui-back/src/usecases/orders/updateOrderStatus.js'
import { allowMethods, failAuth, prepareAuthResponse, readJsonBody } from '../../_lib/auth.js'
import { authorizeOrderRequest, orderIdFrom } from '../../_lib/orders.js'
import { ok } from '../../_lib/response.js'

/** PATCH /api/orders/:id/status — owner/operator de la tienda del pedido. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareAuthResponse(res)
  if (!allowMethods(req, res, ['PATCH'])) return

  let config: AuthConfig | undefined
  try {
    const runtime = await getAuthRuntime()
    config = runtime.config
    const actor = await authorizeOrderRequest(req, runtime, { mutation: true })
    const id = orderIdFrom(req)
    const parsed = updateOrderStatusRequestSchema.safeParse(readJsonBody(req))
    if (!parsed.success) throw new ValidationError('Invalid body', issuesFromZodError(parsed.error))
    const { orders } = await getRepositories()
    const updated = await updateOrderStatus({ orders, clock: runtime.deps.clock }, actor, id, parsed.data.status)
    ok(res, toOrderDto(updated))
  } catch (err) {
    failAuth(res, err, config)
  }
}
