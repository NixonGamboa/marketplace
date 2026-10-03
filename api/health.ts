import { withObservability } from './_lib/observability.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkHealth } from '../maui-back/src/usecases/health/checkHealth.js'
import { jsonResponse, methodNotAllowed } from './_lib/response.js'
import { buildApiError } from '../shared/contracts/errors.js'

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    methodNotAllowed(res, ['GET', 'HEAD'])
    return
  }

  const head = req.method === 'HEAD'
  try {
    const { getConfig } = await import('../maui-back/src/shared/config.js')
    const config = getConfig()
    const probe = config.DB_DRIVER === 'postgres'
      ? (await import('../maui-back/src/infra/postgres/health.js')).postgresHealthProbe
      : null
    const result = await checkHealth(probe)
    if (result.status === 'ok') {
      jsonResponse(res, { ...result, environment: config.APP_ENV, time: new Date().toISOString() }, 200, head)
    } else {
      const message = result.database === 'not_connected' ? 'Base de datos no conectada' : 'Servicio no disponible'
      jsonResponse(res, buildApiError('SERVICE_UNAVAILABLE', message), 503, head)
    }
  } catch {
    jsonResponse(res, buildApiError('SERVICE_UNAVAILABLE', 'Servicio no disponible'), 503, head)
  }
}

export default withObservability('/api/health', handler)
