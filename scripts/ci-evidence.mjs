import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cell, MAX_EVIDENCE_LINES, writeEvidenceReport } from './evidence-format.mjs'

const dir = process.env.MAUI_EVIDENCE_DIR
if (!dir) throw new Error('Falta el directorio de evidencia CI')
const read = name => existsSync(join(dir, name))
  ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : null
const metadata = read('metadata.json')
if (!metadata) throw new Error('Falta la identificación de esta ejecución')
const gates = read('gates.json') || []
const outcomes = { success: 'aprobado', failure: 'fallido', skipped: 'no ejecutado', cancelled: 'cancelado' }
const outcome = value => outcomes[value] || value || 'sin dato'
// Sin reporte de pruebas: distinguir lo no ejecutado de un gate que falló antes de escribirlo.
const missingReason = script => {
  if (metadata.install !== 'success') return 'No ejecutado: la instalación no terminó correctamente'
  const gate = gates.find(item => item.script === script)
  if (!gate || gate.status === 'no ejecutado') return 'No ejecutado: un gate anterior falló'
  return `Sin reporte (gate ${gate.status}); revisar el log de Actions`
}
const lines = [
  '# Evidencia de la PR', '',
  `SHA comprobado: ${cell(metadata.testedCommit)}. Head de PR: ${cell(metadata.prHeadCommit || 'no aplica')}.`,
  `Fecha: ${cell(metadata.recordedAt)}. Ejecución: ${cell(metadata.run)}.`, '',
  'Alcance: CI con memory/PostgreSQL embebido; unitarias, integración y componentes sin desglose por tipo.',
  'Smoke cloud, mutación y E2E de navegador: no ejecutados por este workflow.', '',
  '## Gates', '',
  '| Comprobación | Resultado |',
  '|---|---|',
  ...[['install', 'instalación'], ['checks', 'checks'], ['build', 'build']]
    .map(([name, label]) => `| ${label} | ${cell(outcome(metadata[name]))} |`),
  ...gates.map(gate => `| ${cell(gate.script)} | ${cell(gate.status)} |`), '',
  '## Pruebas', '',
  '| Aplicación | Aprobadas | Fallidas | Omitidas/pendientes | Total |',
  '|---|---:|---:|---:|---:|',
]
const failures = []
const suites = []
for (const [app, file, script] of [
  ['Backend', 'backend.json', 'test:back'], ['PWA', 'pwa.json', 'test:pwa'], ['Admin', 'admin.json', 'test:admin'],
]) {
  const result = read(file)
  if (!result) {
    lines.push(`| ${app} | — | — | — | ${cell(missingReason(script))} |`)
    continue
  }
  lines.push(`| ${app} | ${result.numPassedTests} | ${result.numFailedTests} | ${result.numPendingTests ?? 0} | ${result.numTotalTests} |`)
  for (const suite of result.testResults || []) {
    const tests = suite.assertionResults || []
    const failed = tests.filter(test => test.status === 'failed')
    const name = suite.name.replace(/\\/g, '/').split('/').slice(-3).join('/')
    suites.push({ failed: failed.length, row: `| ${app}: ${cell(name)} | ${tests.length} | ${failed.length} |` })
    for (const test of failed) failures.push({ app, name: test.fullName || test.title, errors: test.failureMessages })
    // Un error de carga/colección puede no tener assertionResults.
    if (suite.status === 'failed' && failed.length === 0) failures.push({ app, name, errors: [suite.message || 'Error de suite; revisar log de Actions'] })
  }
}
lines.push('', '## Fallos', '')
if (!failures.length) lines.push('Sin fallos individuales en los reportes disponibles; los gates indican errores o pasos no ejecutados.')
else {
  lines.push('| Aplicación / caso | Evidencia del fallo |', '|---|---|')
  // Los fallos tienen prioridad, pero se reserva espacio para la cobertura por suites.
  const capacity = Math.max(0, Math.min(MAX_EVIDENCE_LINES - lines.length - 10, Math.floor((MAX_EVIDENCE_LINES - lines.length) * 0.6)))
  const shown = failures.slice(0, capacity)
  lines.push(...shown.map(failure => `| ${cell(failure.app)}: ${cell(failure.name)} | ${cell(failure.errors || [])} |`))
  if (shown.length < failures.length) lines.push(`Fallos detallados: ${shown.length}/${failures.length}. Los restantes están en el log de Actions: ${cell(metadata.run)}.`)
}
lines.push('', '## Cobertura por suites', '', '| Suite | Casos | Fallos |', '|---|---:|---:|')
const capacity = Math.max(0, MAX_EVIDENCE_LINES - lines.length - 3)
// Las suites con fallos van primero; sort es estable y conserva el orden original del resto.
suites.sort((a, b) => Number(b.failed > 0) - Number(a.failed > 0))
lines.push(...suites.slice(0, capacity).map(suite => suite.row))
if (suites.length > capacity) lines.push(`Suites mostradas: ${capacity}/${suites.length}; listado completo en el log de Actions: ${cell(metadata.run)}.`)
lines.push('', 'Limitaciones: este reporte no demuestra requests/respuestas de Preview; incorporar el smoke nuevo al reporte final cuando aplique.')
writeEvidenceReport(dir, lines)
