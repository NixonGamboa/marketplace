import { z } from 'zod'
import { fingerprint, RecoveryError } from './format.js'

export const DEV_HOST = 'ep-tiny-feather-aug4p4jh.c-10.us-east-1.aws.neon.tech'
export const DEV_BRANCH = 'br-rough-mud-au9ohq6s'
export const PROJECT = 'rough-morning-66975813'
const normalizeHost = (host: string): string => host.toLowerCase().replace('-pooler.', '.')
export const connectionTarget = (env: NodeJS.ProcessEnv): { host: string; database: string; url: string } => {
  if (env.APP_ENV !== 'test' || env.DB_DRIVER !== 'postgres' || env.VERCEL_ENV === 'production'
    || Object.keys(env).some(key => /^PG(HOST|PORT|DATABASE|USER|PASSWORD|SERVICE|OPTIONS)/.test(key) && env[key])) throw new RecoveryError('UNSAFE_ENVIRONMENT')
  try {
    const url = new URL(env.DATABASE_URL ?? '')
    const host = normalizeHost(url.hostname)
    const allowedParameters = new Set(['sslmode', 'channel_binding', 'connect_timeout', 'application_name'])
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password
      || url.hash || (url.port && url.port !== '5432') || [...url.searchParams.keys()].some(key => !allowedParameters.has(key))
      || url.pathname !== '/maui' || host.includes('ep-weathered-salad-auk9jj3u')
      || host === normalizeHost(env.PRODUCTION_DATABASE_HOST ?? '') || !/^ep-[a-z0-9-]+\.c-10\.us-east-1\.aws\.neon\.tech$/.test(host)) throw new Error()
    return { host, database: 'maui', url: url.toString() }
  } catch { throw new RecoveryError('UNSAFE_TARGET') }
}
export const assertSource = (env: NodeJS.ProcessEnv): ReturnType<typeof connectionTarget> => {
  const target = connectionTarget(env)
  if (target.host !== DEV_HOST) throw new RecoveryError('SOURCE_NOT_DEV')
  return target
}
export const provenanceSchema = z.object({ version: z.literal(1), projectId: z.literal(PROJECT), parentBranchId: z.literal(DEV_BRANCH),
  branchId: z.string().regex(/^br-[a-z0-9-]+$/), endpointId: z.string().regex(/^ep-[a-z0-9-]+$/), host: z.string(), database: z.literal('maui'),
  temporary: z.literal(true), createdAt: z.string().datetime(), expiresAt: z.string().datetime(),
  evidence: z.object({ projectId: z.literal(PROJECT), branch: z.object({ id: z.string(), parent_id: z.literal(DEV_BRANCH) }).strict(),
    endpoint: z.object({ id: z.string(), branch_id: z.string(), host: z.string() }).strict() }).strict(),
}).strict()
export type Provenance = z.infer<typeof provenanceSchema>
export const assertRestoreTarget = (env: NodeJS.ProcessEnv, input: unknown, now = Date.now()): { target: ReturnType<typeof connectionTarget>; provenance: Provenance } => {
  const target = connectionTarget(env)
  const parsed = provenanceSchema.safeParse(input)
  if (!parsed.success) throw new RecoveryError('INVALID_PROVENANCE')
  const proof = parsed.data
  const created = Date.parse(proof.createdAt), expires = Date.parse(proof.expiresAt)
  if (target.host === DEV_HOST || proof.branchId === DEV_BRANCH || proof.branchId === 'br-patient-mouse-au2580c5'
    || proof.branchId !== proof.evidence.branch.id || proof.branchId !== proof.evidence.endpoint.branch_id
    || proof.endpointId !== proof.evidence.endpoint.id || !target.host.startsWith(`${proof.endpointId}.`)
    || normalizeHost(proof.host) !== target.host || normalizeHost(proof.evidence.endpoint.host) !== target.host
    || created > now || expires <= now || expires - created > 24 * 60 * 60 * 1000) throw new RecoveryError('UNSAFE_RESTORE_TARGET')
  return { target, provenance: proof }
}
export const restorePlanSchema = z.object({ version: z.literal(1), branchId: z.string(), host: z.string(), backupHash: z.string(), beforeHash: z.string(), provenanceHash: z.string(), createdAt: z.string().datetime(), expiresAt: z.string().datetime() }).strict()
export type RestorePlan = z.infer<typeof restorePlanSchema>
export const confirmationFor = (plan: RestorePlan): string => fingerprint(plan)
export const verifyConfirmation = (plan: RestorePlan, current: RestorePlan, confirm: string, now = Date.now()): void => {
  if (confirmationFor(plan) !== confirm || plan.branchId !== current.branchId || plan.host !== current.host
    || plan.backupHash !== current.backupHash || plan.beforeHash !== current.beforeHash || plan.provenanceHash !== current.provenanceHash
    || Date.parse(plan.createdAt) > now || Date.parse(plan.expiresAt) <= now
    || Date.parse(plan.expiresAt) - Date.parse(plan.createdAt) > 5 * 60 * 1000) throw new RecoveryError('STALE_CONFIRMATION')
}
