import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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
  ['check:contracts'],
  ['lint:pwa'],
  ['lint:admin'],
  ['test:back'],
  ['test:pwa'],
  ['test:admin'],
]

for (const [script] of checks) {
  console.log(`\nValidando ${script}`)
  const result = spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: root, env, stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
