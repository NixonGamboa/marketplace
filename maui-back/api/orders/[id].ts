import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRepositories } from '../../src/infra/factory.js'
import { NotFoundError } from '../../src/shared/errors.js'
import { fail, ok } from '../_lib/response.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  const id = typeof req.query.id === 'string' ? req.query.id : req.query.id?.[0]
  if (!id) {
    res.status(400).json({ error: 'MISSING_ID' })
    return
  }

  try {
    const { orders } = await getRepositories()
    const order = await orders.findById(id)
    if (!order) throw new NotFoundError('Order', id)
    ok(res, order)
  } catch (err) {
    fail(res, err)
  }
}
