/**
 * Reporter propio: el de lista de Playwright imprime el log de acciones (incluye valores de `fill`).
 * Este solo emite título, estado, duración y el mensaje de error saneado y truncado, y guarda un
 * resultado JSON sin adjuntos, trazas ni cuerpos de red.
 */
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { mkdirSync, writeFileSync } from 'node:fs'
import { LOCAL_DIR } from './runtime.js'
import { redact } from './redact.js'

const MAX_ERROR_CHARS = 700

interface Entry { title: string; status: string; durationMs: number; error?: string }

export default class SanitizedReporter implements Reporter {
  private readonly entries: Entry[] = []

  onTestEnd(test: TestCase, result: TestResult): void {
    const failure = result.errors[0]?.message
    const entry: Entry = {
      title: test.titlePath().slice(2).join(' › '),
      status: result.status,
      durationMs: result.duration,
      ...(failure ? { error: redact(failure.replace(/\u001b\[[0-9;]*m/g, '')).slice(0, MAX_ERROR_CHARS) } : {}),
    }
    this.entries.push(entry)
    const mark = entry.status === 'passed' ? 'ok' : entry.status === 'skipped' ? 'omitido' : 'FALLO'
    console.log(`[${mark}] ${entry.title} (${Math.round(entry.durationMs / 1000)} s)`)
    if (entry.error) console.log(`       ${entry.error.replace(/\n/g, '\n       ')}`)
  }

  onEnd(result: FullResult): void {
    const passed = this.entries.filter((entry) => entry.status === 'passed').length
    console.log(`\nResultado: ${result.status}. ${passed}/${this.entries.length} aprobadas.`)
    mkdirSync(LOCAL_DIR, { recursive: true })
    writeFileSync(`${LOCAL_DIR}e2e-result.json`, JSON.stringify({
      finishedAt: new Date().toISOString(), status: result.status, tests: this.entries,
    }, null, 2))
  }
}
