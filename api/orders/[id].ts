import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildApiError, entityIdSchema, issuesFromZodError } from '../../shared/contracts/index.js'
import { toOrderDto } from '../../maui-back/src/domain/orders/orderMappers.js'
import { getRepositories } from '../../maui-back/src/infra/factory.js'
import { NotFoundError, ValidationError } from '../../maui-back/src/shared/errors.js'
import { fail, ok } from '../_lib/response.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
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
    // Sin auth (T-06): conocer el ID aún basta para leer el pedido. No cerrado en T-04.
    const { orders } = await getRepositories()
    const order = await orders.findById(parsedId.data)
    if (!order) throw new NotFoundError('Order', parsedId.data)
    ok(res, toOrderDto(order))
  } catch (err) {
    fail(res, err)
  }
}
