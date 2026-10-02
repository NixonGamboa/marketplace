import { appendFileSync } from 'node:fs'
import { cell, redact, writeEvidenceReport } from './evidence-format.mjs'

const text = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${name}`)
  return value
}

try {
  const input = JSON.parse(text(process.env.PREVIEW_EVIDENCE_JSON, 'reporte JSON'))
  const testedCommit = text(input.testedCommit, 'SHA comprobado')
  if (!/^[a-f0-9]{40}$/i.test(testedCommit)) throw new Error('El SHA comprobado debe tener 40 caracteres hexadecimales')
  const deploymentUrl = new URL(text(input.deployment?.url, 'URL del deployment'))
  if (input.deployment?.environment !== 'preview' || deploymentUrl.protocol !== 'https:' ||
      !deploymentUrl.hostname.endsWith('.vercel.app') || deploymentUrl.username || deploymentUrl.password ||
      deploymentUrl.search || deploymentUrl.hash) throw new Error('Se exige Preview Vercel sin credenciales en la URL')
  const executedAt = text(input.executedAt, 'fecha de ejecución')
  if (!Number.isFinite(Date.parse(executedAt))) throw new Error('Fecha de ejecución inválida')
  const ci = {
    run: text(input.ci?.run, 'enlace de CI'),
    testedCommit: text(input.ci?.testedCommit, 'SHA de CI'),
    result: input.ci?.result,
    summary: text(input.ci?.summary, 'resumen CI'),
  }
  if (!/^[a-f0-9]{40}$/i.test(ci.testedCommit) || !['passed', 'failed', 'not_run'].includes(ci.result)) {
    throw new Error('Identificación o resultado CI inválidos')
  }
  // El run de CI debe ser un run de Actions de este mismo repositorio, no un enlace arbitrario.
  const runMatch = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/\d+$/.exec(ci.run)
  if (!runMatch || (process.env.GITHUB_REPOSITORY && runMatch[1].toLowerCase() !== process.env.GITHUB_REPOSITORY.toLowerCase())) {
    throw new Error('El enlace de CI debe ser un run de Actions de este repositorio')
  }
  if (!Array.isArray(input.checks) || input.checks.length === 0) throw new Error('Se exige evidencia por caso')
  const checks = input.checks.map(check => {
    if (!['passed', 'failed'].includes(check.status)) throw new Error('Estado de prueba inválido')
    for (const field of ['expected', 'actual']) {
      if (check[field] == null || check[field] === '') throw new Error(`Falta resultado ${field}`)
    }
    return redact({
      name: text(check.name, 'nombre de prueba'),
      setup: text(check.setup, 'preparación de prueba'),
      expected: check.expected,
      actual: check.actual,
      status: check.status,
    })
  })
  const report = redact({
    scope: 'Smoke Preview ejecutado por el orquestador; este workflow publica la evidencia, no ejecuta el smoke',
    block: text(input.block, 'bloque'),
    testedCommit,
    executedAt,
    ci,
    deployment: { id: text(input.deployment.id, 'ID del deployment'), url: deploymentUrl.href, environment: 'preview' },
    publisherCommit: process.env.GITHUB_SHA || null,
    run: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
    checks,
  })
  const dir = text(process.env.MAUI_EVIDENCE_DIR, 'directorio de evidencia')
  const failures = checks.filter(check => check.status === 'failed').length
  writeEvidenceReport(dir, [
    '# Evidencia de la PR', '',
    `Bloque: ${cell(report.block)}. SHA Preview: ${testedCommit}. Fecha: ${cell(executedAt)}.`,
    `Deployment: ${cell(report.deployment.id)} — ${cell(report.deployment.url)}`,
    `Publicador: ${cell(report.publisherCommit || 'local')}. Ejecución: ${cell(report.run || 'local')}.`, '',
    '## CI', '',
    `Resultado: ${cell(ci.result)}. SHA comprobado por CI: ${ci.testedCommit}.`,
    `Resumen: ${cell(ci.summary)}. Ejecución: ${cell(ci.run)}.`, '',
    '## Smoke Preview', '',
    `Resultado: ${checks.length - failures}/${checks.length} aprobadas.`,
    'El orquestador ejecuta el smoke; este workflow publica su evidencia. Cuerpos limitados a campos relevantes.', '',
    '| Caso | Preparación / request | Esperado | Observado | Resultado |',
    '|---|---|---|---|---|',
    ...checks.map(check => `| ${cell(check.name)} | ${cell(check.setup)} | ${cell(check.expected)} | ${cell(check.actual)} | ${check.status} |`), '',
    '## Limitaciones y limpieza', '',
    `Limitaciones: ${cell(text(input.limitations, 'limitaciones; indicar ninguna si no existen'))}.`,
    'Las comprobaciones SQL y de limpieza figuran como casos cuando aplican. No se atribuyen pruebas no ejecutadas.',
  ])
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'report-ready=true\n')
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Pruebas Preview: ${checks.length - failures}/${checks.length} aprobadas.\n`)
  }
  if (failures || ci.result !== 'passed') process.exitCode = 1
} catch (error) {
  // No imprimir el input: los errores del parser (SyntaxError) y de acceso (TypeError) pueden citar valores.
  // Los errores propios de validación solo nombran el campo y son seguros de mostrar.
  const reason = error instanceof Error && !(error instanceof SyntaxError) && !(error instanceof TypeError)
    ? error.message : 'JSON o estructura no reconocidos'
  console.error(`Reporte inválido o mayor de 200 líneas (${reason}). Revisa .github/evidencia.md.`)
  process.exitCode = 1
}
