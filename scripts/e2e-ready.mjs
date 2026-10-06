import { createHash } from 'node:crypto'

// Lectura del «ready» que publica root (orquestacion-local/night-cloud-ready.json) tras identificar el
// Preview en modo real y dejar el seed limpio. El esquema exacto no está fijado: se aceptan los
// nombres habituales y nunca se leen credenciales de este archivo.
const URL_KEYS = ['previewUrl', 'deploymentUrl', 'baseUrl', 'url', 'origin']
const SHA_KEYS = ['sha', 'commit', 'commitSha', 'testedCommit', 'headSha', 'gitSha']
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const firstString = (pools, keys) => {
  for (const pool of pools) for (const key of keys) if (typeof pool[key] === 'string' && pool[key]) return pool[key]
  return null
}

/** Hash del contenido: cada publicación nueva de root (tras un reset) produce una marca distinta. */
export const readyStamp = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16)

/** Proof independiente emitido por el helper después de reconsultar cloud; nunca se deriva del ready. */
export function parseIsolatedReady(data, proof, consumed = { stamps: [] }, text = JSON.stringify(data)) {
  const reject = (reason) => { throw new Error(reason) }
  const fresh = (at, maxAge) => Number.isFinite(Date.parse(at)) && Date.now() >= Date.parse(at) && Date.now() - Date.parse(at) < maxAge
  const digest = (value) => /^[0-9a-f]{64}$/.test(value ?? '')
  if (!isObject(proof) || proof.kind !== 'maui-isolated-preflight' || proof.ok !== true ||
    !fresh(proof.verifiedAt, 60_000) || !fresh(proof.metadataVerifiedAt, 300_000)) reject('Falta preflight independiente y reciente de metadata, deployment y SQL')
  if (data.ready !== true || data.mode !== 'real' || data.dataMode !== 'isolated-preserved-baseline' ||
    Object.hasOwn(data, 'seedClean') || Object.hasOwn(data, 'resetAt') || data.demo === true) reject('Ready aislado exige baseline conservada explícita, sin seedClean ni reset')
  if (!/^[0-9a-f]{40}$/.test(proof.sha ?? '') || data.sha !== proof.sha || data.ref !== proof.ref ||
    proof.ref !== 'feature/me01-me04-mejoras-ux' || data.deploymentId !== proof.deploymentId ||
    !/^dpl_/.test(proof.deploymentId ?? '') || data.target !== 'preview' || proof.target !== 'preview') reject('Ready no coincide con SHA/ref/deployment Preview verificados')
  let url
  try { url = new URL(data.origin) } catch { reject('Origen aislado inválido') }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    !url.hostname.endsWith('.vercel.app') || url.origin !== proof.origin || url.hostname !== proof.alias ||
    data.authOrigin !== proof.origin) reject('Origen, alias y AUTH_ORIGIN no coinciden con el deployment observado')
  const clone = data.isolation
  const verified = proof.isolation
  if (!isObject(clone) || !isObject(verified) || verified.projectId !== 'rough-morning-66975813' ||
    verified.parentId !== 'br-rough-mud-au9ohq6s' || !/^br-/.test(verified.branchId ?? '') ||
    ['br-rough-mud-au9ohq6s', 'br-patient-mouse-au2580c5'].includes(verified.branchId) ||
    verified.default !== false || verified.primary !== false || verified.database !== 'maui' ||
    verified.includedResourcesConfirmed !== true || !/^ep-[a-z0-9-]+(?:-pooler)?\.c-10\.us-east-1\.aws\.neon\.tech$/.test(verified.host ?? '') ||
    ['ep-tiny-feather-aug4p4jh', 'ep-weathered-salad-auk9jj3u'].some((host) => verified.host.startsWith(host)) ||
    ['projectId', 'parentId', 'branchId', 'default', 'primary', 'database', 'host', 'endpointId', 'includedResourcesConfirmed'].some((key) => clone[key] !== verified[key]) || !verified.endpointId) reject('Aislamiento Neon no coincide con metadata independiente')
  const baseline = data.baseline
  const expected = proof.baseline
  if (!isObject(baseline) || !isObject(expected) || expected.preservesExistingOrders !== true ||
    !Number.isInteger(expected.orderCount) || expected.orderCount < 1 || !digest(expected.legacyOrdersSha256) ||
    !digest(expected.catalogStoreSha256) || expected.resetPerformed !== false || expected.seedPerformed !== false ||
    ['preservesExistingOrders', 'orderCount', 'legacyOrdersSha256', 'catalogStoreSha256', 'resetPerformed', 'seedPerformed'].some((key) => baseline[key] !== expected[key])) reject('Baseline legacy no coincide con la comprobación SQL independiente')
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(proof.runId ?? '') || data.runId !== proof.runId || !fresh(data.verifiedAt, 300_000)) reject('Ready vencido o runId distinto del autorizado')
  const stamp = readyStamp(text)
  if (consumed.stamps.some((entry) => entry.stamp === stamp || entry.runId === data.runId)) reject('Ready o runId aislado ya consumido; requiere nueva comprobación y corrida propia')
  return { origin: url.origin, sha: proof.sha, dataMode: data.dataMode, runId: data.runId }
}

export function parseReady(text, options = {}) {
  let data
  try { data = JSON.parse(text) } catch { throw new Error('night-cloud-ready.json no es JSON válido') }
  if (!isObject(data)) throw new Error('night-cloud-ready.json debe ser un objeto JSON')
  if (data.dataMode !== undefined) {
    if (data.dataMode !== 'isolated-preserved-baseline') throw new Error('Modo de datos del ready desconocido')
    return parseIsolatedReady(data, options.verifiedProof, options.consumed, text)
  }
  const pools = [data, data.preview, data.deployment, data.env].filter(isObject)

  if (data.ready === false || data.seedClean === false) throw new Error('Root marcó el entorno como no listo')
  const mode = firstString(pools, ['mode', 'appMode'])
  if (mode !== null && mode.toLowerCase() !== 'real') throw new Error('El Preview del ready no está en modo real')
  if (pools.some((pool) => pool.demo === true || pool.VITE_DEMO_MODE === 'true')) {
    throw new Error('El Preview del ready está construido en modo demo')
  }

  const rawUrl = firstString(pools, [...URL_KEYS, 'BASE_URL', 'AUTH_ORIGIN'])
  if (!rawUrl) {
    throw new Error(`night-cloud-ready.json sin URL del Preview (claves presentes: ${Object.keys(data).join(', ') || 'ninguna'})`)
  }
  let origin
  try { origin = new URL(rawUrl).origin } catch { throw new Error('La URL del ready no es válida') }
  const authRaw = firstString(pools, ['authOrigin', 'AUTH_ORIGIN'])
  const authOrigin = authRaw ? new URL(authRaw).origin : null
  if (authOrigin && authOrigin !== origin) throw new Error('AUTH_ORIGIN del ready difiere de la URL del Preview')
  return { origin, sha: firstString(pools, SHA_KEYS) }
}
