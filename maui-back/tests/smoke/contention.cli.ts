import { SEED_STAFF } from '../../src/usecases/seed/dataset.js'
import { runContentionSmoke } from './contention.js'
import { createContentionFetchClient } from './fetchClient.js'

/**
 * Smoke de contención contra una API de test desplegada (ver `contention.ts`). Uso, desde `maui-back`:
 *
 *   npx tsx --env-file=.env.local tests/smoke/contention.cli.ts [--quota] [--parallelism=8]
 *
 * Variables: `SMOKE_BASE_URL`, `SEED_OWNER_PASSWORD`, `SEED_OPERATOR_PASSWORD` y, si Preview está
 * protegido, `SMOKE_BYPASS_TOKEN` (más `SMOKE_AUTH_ORIGIN` cuando el origen autorizado difiere).
 * Crea un cliente y pedidos de recogida propios y los cancela al terminar. Salida: JSON sin cookies
 * ni credenciales. Códigos: 0 correcto, 1 hay comprobaciones fallidas, 2 no se ejecutó (entorno,
 * tienda cerrada, credenciales o configuración).
 */
async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const parallelism = Number(args.find(arg => arg.startsWith('--parallelism='))?.split('=')[1] ?? 8)
  const owner = SEED_STAFF.find(staff => staff.key === 'owner')!
  const operator = SEED_STAFF.find(staff => staff.key === 'operator')!
  const missing = ['SMOKE_BASE_URL', 'SEED_OWNER_PASSWORD', 'SEED_OPERATOR_PASSWORD'].filter(name => !process.env[name])
  if (missing.length > 0) {
    console.error(JSON.stringify({ blocked: `faltan variables de entorno: ${missing.join(', ')}` }))
    return 2
  }
  const report = await runContentionSmoke(
    createContentionFetchClient(process.env),
    { owner: { email: owner.email, password: process.env.SEED_OWNER_PASSWORD! }, operator: { email: operator.email, password: process.env.SEED_OPERATOR_PASSWORD! } },
    { parallelism, quota: args.includes('--quota') },
  )
  console.log(JSON.stringify(report, null, 2))
  return report.blocked ? 2 : report.ok ? 0 : 1
}

main().then(code => { process.exitCode = code }, () => {
  // Un error inesperado no se imprime: puede llevar cabeceras o URLs.
  console.error(JSON.stringify({ blocked: 'error inesperado del smoke de contención' }))
  process.exitCode = 2
})
