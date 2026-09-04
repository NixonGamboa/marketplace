import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOrder } from '../../maui-back/src/usecases/orders/createOrder.js'
import { getRepositories } from '../../maui-back/src/infra/factory.js'
import { systemClock } from '../../maui-back/src/shared/clock.js'
import { fail, ok } from '../_lib/response.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  try {
    const { orders } = await getRepositories()
    const created = await createOrder({ orders, clock: systemClock }, req.body)
    ok(res, created, 201)
  } catch (err) {
    fail(res, err)
  }
}
