import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildApiError,
  entityIdSchema,
  issuesFromZodError,
  updateOrderStatusRequestSchema,
} from '../../../shared/contracts/index.js'
import { toOrderDto } from '../../../maui-back/src/domain/orders/orderMappers.js'
import { updateOrderStatus } from '../../../maui-back/src/usecases/orders/updateOrderStatus.js'
import { getRepositories } from '../../../maui-back/src/infra/factory.js'
import { systemClock } from '../../../maui-back/src/shared/clock.js'
import { ValidationError } from '../../../maui-back/src/shared/errors.js'
import { fail, ok } from '../../_lib/response.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH')
    res.status(405).json(buildApiError('METHOD_NOT_ALLOWED', 'Method not allowed'))
    return
  }

  const id = typeof req.query.id === 'string' ? req.query.id : req.query.id?.[0]
  if (!id) {
    res.status(400).json(buildApiError('MISSING_ID', 'Missing order id'))
    return
  }

  try {
    const parsedId = entityIdSchema.safeParse(id)
    if (!parsedId.success) {
      throw new ValidationError('Invalid order id', issuesFromZodError(parsedId.error))
    }
    const parsed = updateOrderStatusRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new ValidationError('Invalid body', issuesFromZodError(parsed.error))
    }
    // Sin auth (T-06): cualquiera puede cambiar el estado. No cerrado en T-04.
    const { orders } = await getRepositories()
    const updated = await updateOrderStatus(
      { orders, clock: systemClock },
      parsedId.data,
      parsed.data.status,
    )
    ok(res, toOrderDto(updated))
  } catch (err) {
    fail(res, err)
  }
}
