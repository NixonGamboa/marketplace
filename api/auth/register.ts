import { withObservability } from '../_lib/observability.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import { registerCustomer } from '../../maui-back/src/usecases/auth/registerCustomer.js'
import {
  allowMethods,
  failAuth,
  prepareAuthResponse,
  readJsonBody,
  requireTrustedOrigin,
  sendSession,
} from '../_lib/auth.js'

/** POST /api/auth/register — alta pública de CLIENTE; abre sesión por cookie HttpOnly. */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareAuthResponse(res)
  if (!allowMethods(req, res, ['POST'])) return

  try {
    const { config, deps } = await getAuthRuntime()
    requireTrustedOrigin(req, config)
    const issued = await registerCustomer(deps, readJsonBody(req))
    sendSession(res, config, issued, 201)
  } catch (err) {
    failAuth(res, err)
  }
}

export default withObservability('/api/auth/register', handler)
