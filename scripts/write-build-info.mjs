import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]
if (!['real', 'demo'].includes(mode)) throw new Error('Indica el modo real o demo del build')
const root = fileURLToPath(new URL('../', import.meta.url))
const revision = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? revision(['rev-parse', 'HEAD'])
if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('El build requiere un SHA identificable')
const info = { version: 1, mode, sha, builtAt: new Date().toISOString() }
writeFileSync(new URL('../MAUI-PWA-customers/dist/build-info.json', import.meta.url), JSON.stringify(info))
console.info(`Build ${mode} identificado: ${sha}`)
