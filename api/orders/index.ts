import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildApiError } from '../../shared/contracts/index.js'
import { DEFAULT_STORE_ID } from '../../maui-back/src/domain/orders/Order.js'
import { toOrderConfirmation } from '../../maui-back/src/domain/orders/orderMappers.js'
import { createOrder } from '../../maui-back/src/usecases/orders/createOrder.js'
import { getRepositories } from '../../maui-back/src/infra/factory.js'
import { systemClock } from '../../maui-back/src/shared/clock.js'
import { fail, ok } from '../_lib/response.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json(buildApiError('METHOD_NOT_ALLOWED', 'Method not allowed'))
    return
  }

  try {
    const { orders } = await getRepositories()
    // Sin auth (T-05/T-06): contexto mínimo; el cliente no puede elegir tienda.
    const created = await createOrder(
      { orders, clock: systemClock },
      req.body,
      { storeId: DEFAULT_STORE_ID },
    )
    ok(res, toOrderConfirmation(created), 201)
  } catch (err) {
    fail(res, err)
  }
}
