import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuthRuntime } from '../../maui-back/src/infra/auth/factory.js'
import { login } from '../../maui-back/src/usecases/auth/login.js'
import {
  allowMethods,
  failAuth,
  prepareAuthResponse,
  readJsonBody,
  requireTrustedOrigin,
  sendSession,
} from '../_lib/auth.js'

/** POST /api/auth/login — email (staff) o teléfono (cliente); abre sesión por cookie HttpOnly. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareAuthResponse(res)
  if (!allowMethods(req, res, ['POST'])) return

  try {
    const { config, deps } = await getAuthRuntime()
    requireTrustedOrigin(req, config)
    const issued = await login(deps, readJsonBody(req))
    sendSession(res, config, issued, 200)
  } catch (err) {
    failAuth(res, err)
  }
}
