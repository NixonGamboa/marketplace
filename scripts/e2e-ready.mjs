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

export function parseReady(text) {
  let data
  try { data = JSON.parse(text) } catch { throw new Error('night-cloud-ready.json no es JSON válido') }
  if (!isObject(data)) throw new Error('night-cloud-ready.json debe ser un objeto JSON')
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
