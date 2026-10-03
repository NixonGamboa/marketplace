import { withObservability } from './_lib/observability.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildApiError, issuesFromZodError, listAuditQuerySchema } from '../shared/contracts/index.js'
import { AuditPersistenceError } from '../maui-back/src/domain/audit/AuditRepository.js'
import { staffStoreOf } from '../maui-back/src/domain/store/storeAccess.js'
import { getAuthRuntime, type AuthRuntime } from '../maui-back/src/infra/auth/factory.js'
import { getRepositories } from '../maui-back/src/infra/factory.js'
import { ValidationError } from '../maui-back/src/shared/errors.js'
import { listAuditForActor } from '../maui-back/src/usecases/audit/listAudit.js'
import { allowMethods, authenticateRequest, failAuth, prepareAuthResponse } from './_lib/auth.js'
import { jsonResponse, ok } from './_lib/response.js'

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  prepareAuthResponse(res)
  if (!allowMethods(req, res, ['GET'])) return
  let runtime: AuthRuntime | undefined
  try {
    runtime = await getAuthRuntime()
    const { account } = await authenticateRequest(req, runtime)
    staffStoreOf(account)
    const parsed = listAuditQuerySchema.safeParse(req.query ?? {})
    if (!parsed.success) throw new ValidationError('Invalid query', issuesFromZodError(parsed.error))
    const { audit } = await getRepositories()
    ok(res, await listAuditForActor(audit, account, parsed.data))
  } catch (error) {
    if (error instanceof AuditPersistenceError) jsonResponse(res, buildApiError('SERVICE_UNAVAILABLE', 'Servicio no disponible'), 503)
    else failAuth(res, error, runtime?.config)
  }
}

export default withObservability('/api/audit', handler)
