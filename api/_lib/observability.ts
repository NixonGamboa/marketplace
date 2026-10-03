import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requestIdFrom, runWithRequest, type RequestMetrics } from '../../maui-back/src/shared/observability.js'

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void
/** La ruta viene del código; nunca de URL/query/ID, cookies, body o errores del driver. */
export const withObservability = (endpoint: string, handler: Handler): Handler => async (req, res) => {
  const context: RequestMetrics = { requestId: requestIdFrom(req.headers?.['x-request-id']), orderCreated: 0, orderReplayed: 0 }
  const start = performance.now()
  res.setHeader('X-Request-Id', context.requestId)
  let failed = false
  try {
    await runWithRequest(context, () => handler(req, res))
  } catch (error) {
    failed = true
    throw error
  } finally {
    const status = failed ? 500 : res.statusCode
    const event = { event: 'api_request', endpoint,
      method: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method ?? '') ? req.method : 'OTHER',
      status, durationMs: Math.round((performance.now() - start) * 100) / 100,
      requestId: context.requestId, error: status >= 400,
      orderCreated: context.orderCreated, orderReplayed: context.orderReplayed,
      ...(context.auditFailure ? { auditFailure: context.auditFailure } : {}),
    }
    const minimumStatus = process.env.LOG_LEVEL === 'error' ? 500 : process.env.LOG_LEVEL === 'warn' ? 400 : 0
    if (status >= minimumStatus) console.info(JSON.stringify(event))
  }
}
