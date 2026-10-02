import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MAX_EVIDENCE_LINES = 200

// El productor excluye secretos antes de enviar evidencia; esta redacción es adicional.
export function redact(value, key = '') {
  if (/password|contrase[nñ]a|cookie|authorization|token|secret|database.?url|connection.?string/i.test(key)) return '[REDACTADO]'
  if (Array.isArray(value)) return value.map(item => redact(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]))
  }
  if (typeof value === 'string') {
    return value
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTADO]')
      .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTADO]')
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[CONEXIÓN REDACTADA]')
  }
  return value
}

export function cell(value) {
  const clean = redact(value)
  return (typeof clean === 'string' ? clean : JSON.stringify(clean))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\r\n]+/g, ' ⏎ ').replace(/\|/g, '\\|').replace(/`/g, '\\`')
}

export function writeEvidenceReport(dir, lines) {
  const markdown = lines.join('\n')
  if (markdown.split('\n').length > MAX_EVIDENCE_LINES) {
    throw new Error('El reporte supera 200 líneas; resumir la evidencia sin ocultar fallos')
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'report.md'), markdown)
  return markdown
}
