import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { updateOrderStatus } from '../../../maui-back/src/usecases/orders/updateOrderStatus.js'
import { getRepositories } from '../../../maui-back/src/infra/factory.js'
import { systemClock } from '../../../maui-back/src/shared/clock.js'
import { ValidationError } from '../../../maui-back/src/shared/errors.js'
import { OrderStatus } from '../../../maui-back/src/domain/orders/Order.js'
import { fail, ok } from '../../_lib/response.js'

const bodySchema = z.object({
  status: z.enum([
    OrderStatus.RECEIVED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.IN_DELIVERY,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ]),
})

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  const id = typeof req.query.id === 'string' ? req.query.id : req.query.id?.[0]
  if (!id) {
    res.status(400).json({ error: 'MISSING_ID' })
    return
  }

  try {
    const parsed = bodySchema.safeParse(req.body)
    if (!parsed.success) {
      throw new ValidationError('Invalid body', parsed.error.flatten())
    }
    const { orders } = await getRepositories()
    const updated = await updateOrderStatus(
      { orders, clock: systemClock },
      id,
      parsed.data.status,
    )
    ok(res, updated)
  } catch (err) {
    fail(res, err)
  }
}
