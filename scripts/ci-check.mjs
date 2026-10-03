import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Ejecuta la validación mediante npm run ci:check')

// Los tests memory son fixtures aislados; este gate nunca necesita acceso cloud.
const env = {
  ...process.env,
  APP_ENV: 'local',
  NODE_ENV: 'test',
  DB_DRIVER: 'memory',
  LOG_LEVEL: 'error',
}
for (const key of [
  'DATABASE_URL', 'VERCEL_ENV', 'AUTH_JWT_SECRET', 'AUTH_ORIGIN',
  'TEST_DATABASE_HOST', 'TEST_DATABASE_NAME',
  'PRODUCTION_DATABASE_HOST', 'PRODUCTION_DATABASE_NAME',
]) delete env[key]

const checks = [
  ['typecheck:back'],
  ['typecheck:pwa'],
  ['typecheck:admin'],
  ['typecheck:e2e'],
  ['check:contracts'],
  ['lint:pwa'],
  ['lint:admin'],
  ['test:back'],
  ['test:pwa'],
  ['test:admin'],
  // Guardas y saneado del runner de navegador: sin red, credenciales ni Chrome.
  ['e2e:selftest'],
]

// Solo CI activa reportes; la validación local conserva sus comandos habituales.
const evidenceDir = process.env.MAUI_EVIDENCE_DIR
  ? resolve(root, process.env.MAUI_EVIDENCE_DIR)
  : null
const reports = {
  'test:back': { app: 'maui-back', file: 'backend.json' },
  'test:pwa': { app: 'MAUI-PWA-customers', file: 'pwa.json' },
  'test:admin': { app: 'maui-admin-front', file: 'admin.json' },
}
const gates = checks.map(([script]) => ({ script, status: 'no ejecutado' }))
if (evidenceDir) mkdirSync(evidenceDir, { recursive: true })
const saveGates = () => {
  if (evidenceDir) writeFileSync(join(evidenceDir, 'gates.json'), JSON.stringify(gates, null, 2))
}
saveGates()

for (const [script] of checks) {
  console.log(`\nValidando ${script}`)
  let args = [npmCli, 'run', script]
  if (evidenceDir && reports[script]) {
    const report = reports[script]
    // Invocar el paquete directamente: los scripts raíz contienen un segundo npm.
    args = [npmCli, '--prefix', report.app, 'run', 'test', '--', '--run',
      '--reporter=default', '--reporter=json', `--outputFile=${join(evidenceDir, report.file)}`]
  }
  const startedAt = new Date().toISOString()
  const result = spawnSync(process.execPath, args, {
    cwd: root, env, stdio: 'inherit',
  })
  Object.assign(gates.find(gate => gate.script === script), {
    status: result.status === 0 ? 'aprobado' : 'fallido',
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.status,
  })
  saveGates()
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
