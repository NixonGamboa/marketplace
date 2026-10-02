import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import type { AuthConfig } from '../../maui-back/src/infra/auth/config.js'
import { authenticateSession } from '../../maui-back/src/usecases/auth/authenticateSession.js'
import {
  allowMethods,
  failAuth,
  prepareAuthResponse,
  sendSessionStatus,
  sessionTokenFrom,
} from '../_lib/auth.js'

/** GET /api/auth/session — cuenta vigente leída de la BD (rol/tienda no salen del JWT). */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareAuthResponse(res)
  if (!allowMethods(req, res, ['GET'])) return

  let config: AuthConfig | undefined
  try {
    const runtime = await getAuthRuntime()
    config = runtime.config
    const context = await authenticateSession(runtime.deps, sessionTokenFrom(req, config))
    sendSessionStatus(res, context)
  } catch (err) {
    failAuth(res, err, config)
  }
}
