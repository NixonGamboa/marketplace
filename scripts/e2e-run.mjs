import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parseReady, readyStamp } from './e2e-ready.mjs'

// Launcher del runner E2E de navegador (T-22).
//
//   npm run e2e:selftest   guardas y saneado, sin red ni navegador
//   npm run e2e:check      solo lectura contra el Preview: API de test conectada y apps en modo REAL
//   npm run e2e:smoke      smoke con escrituras: crea UN pedido propio (consume el ready de root)
//
// Los modos contra el Preview exigen orquestacion-local/night-cloud-ready.json (root lo publica con el
// Preview identificado y el seed limpio). El smoke consume cada ready una sola vez: otra corrida
// completa necesita un reset y un ready nuevos. Credenciales (SMOKE_*) y bypass llegan solo por entorno.
const root = fileURLToPath(new URL('../', import.meta.url))
const localDir = `${root}orquestacion-local/`
const readyFile = process.env.E2E_READY_FILE ?? `${localDir}night-cloud-ready.json`
const consumedFile = `${localDir}e2e-consumed.json`

const modes = {
  selftest: { args: ['--project', 'selftest'], live: false },
  check: { args: ['--project', 'real', '--grep', '@destino'], live: true, consumes: false },
  smoke: { args: ['--project', 'real', '--grep', '@smoke'], live: true, consumes: true },
  full: { args: ['--project', 'real', '--grep', '@smoke|@completo'], live: true, consumes: true },
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const mode = modes[process.argv[2] ?? '']
if (!mode) fail(2, 'Uso: node scripts/e2e-run.mjs <selftest|check|smoke|full>')

const env = { ...process.env }
if (mode.live) {
  if (!existsSync(readyFile)) {
    fail(3, 'Sin night-cloud-ready.json: root debe publicar el Preview real con el seed limpio antes de ejecutar contra cloud.')
  }
  const text = readFileSync(readyFile, 'utf8')
  let ready
  try { ready = parseReady(text) } catch (error) { fail(3, `Ready inválido: ${error.message}`) }
  const stamp = readyStamp(text)
  if (env.BASE_URL && new URL(env.BASE_URL).origin !== ready.origin) {
    fail(3, 'BASE_URL del entorno difiere del Preview del ready; no se ejecuta contra otro destino.')
  }
  const consumed = existsSync(consumedFile) ? JSON.parse(readFileSync(consumedFile, 'utf8')) : { stamps: [] }
  if (mode.consumes && consumed.stamps.some((entry) => entry.stamp === stamp)) {
    fail(4, 'Este ready ya se usó en una corrida con escrituras: espera el reset de root y un night-cloud-ready.json nuevo.')
  }
  if (mode.consumes) {
    mkdirSync(localDir, { recursive: true })
    // Se consume antes de ejecutar: una corrida fallida igualmente pudo crear datos.
    consumed.stamps.push({ stamp, at: new Date().toISOString() })
    writeFileSync(consumedFile, JSON.stringify(consumed, null, 2))
  }
  env.BASE_URL = ready.origin
  env.AUTH_ORIGIN = ready.origin
  env.E2E_READY_STAMP = stamp
  if (ready.sha) env.E2E_PREVIEW_SHA = ready.sha
}

const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
const child = spawn(process.execPath, [cli, 'test', '-c', 'e2e/playwright.config.ts', ...mode.args], {
  cwd: root, env, stdio: 'inherit',
})
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
