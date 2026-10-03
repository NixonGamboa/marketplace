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

// Rondas dirigidas: re-ejecutan SOLO pruebas @completo concretas sobre un ready ya consumido por un
// `full`, para verificar una corrección del runner. Máximo dos por ready, siempre registradas; nunca
// incluyen el smoke ni sirven para abrir un ready nuevo.
export const MAX_DIRECTED_ROUNDS = 2

export function directedGrep(pattern) {
  if (typeof pattern !== 'string' || pattern.trim() === '' || pattern.length > 200) {
    throw new Error('La ronda dirigida exige un patrón de título (máx. 200 caracteres)')
  }
  if (/@smoke/i.test(pattern)) throw new Error('Una ronda dirigida no puede incluir el smoke')
  try { new RegExp(pattern) } catch { throw new Error('El patrón de la ronda dirigida no es una expresión válida') }
  return `^(?=.*@completo)(?=.*(?:${pattern}))`
}

export function planDirected(consumed, stamp, pattern, at = new Date().toISOString(), max = MAX_DIRECTED_ROUNDS) {
  const entry = consumed.stamps.find((candidate) => candidate.stamp === stamp)
  if (!entry) throw new Error('Una ronda dirigida exige un ready ya consumido por un full')
  const rounds = entry.rounds ?? []
  if (rounds.length >= max) throw new Error(`Este ready ya agotó sus ${max} rondas dirigidas: root debe resetear y publicar uno nuevo`)
  const grep = directedGrep(pattern)
  return { grep, consumed: { ...consumed, stamps: consumed.stamps.map((candidate) => (candidate === entry ? { ...entry, rounds: [...rounds, { at, pattern }] } : candidate)) } }
}
