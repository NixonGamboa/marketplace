import { withObservability } from '../_lib/observability.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import { logout } from '../../maui-back/src/usecases/auth/logout.js'
import {
  allowMethods,
  failAuth,
  prepareAuthResponse,
  requireEmptyBody,
  requireTrustedOrigin,
  sendLoggedOut,
  sessionTokenFrom,
} from '../_lib/auth.js'

/**
 * POST /api/auth/logout — revoca la sesión en el servidor y borra la cookie.
 * Si la revocación falla responde 503 SIN borrar la cookie: no se aparenta un cierre inexistente.
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareAuthResponse(res)
  if (!allowMethods(req, res, ['POST'])) return

  try {
    const { config, deps } = await getAuthRuntime()
    requireTrustedOrigin(req, config)
    requireEmptyBody(req)
    await logout(deps, sessionTokenFrom(req, config))
    sendLoggedOut(res, config)
  } catch (err) {
    failAuth(res, err)
  }
}

export default withObservability('/api/auth/logout', handler)
