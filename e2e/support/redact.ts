/**
 * Saneado de salida del runner. Nada que llegue a consola, reportes o checkpoints debe contener
 * credenciales, cookies, JWT ni tokens de bypass: se reemplazan los valores exactos del entorno y
 * los formatos conocidos.
 */

const SECRET_ENV_NAMES = [
  'SMOKE_STAFF_PASSWORD', 'SMOKE_CUSTOMER_PASSWORD', 'SMOKE_OWNER_PASSWORD',
  'SMOKE_BYPASS_TOKEN', 'SMOKE_VERCEL_BYPASS',
  'SMOKE_STAFF_EMAIL', 'SMOKE_OWNER_EMAIL', 'SMOKE_CUSTOMER_PHONE',
  'SMOKE_OPERATOR_PASSWORD', 'SMOKE_OPERATOR_EMAIL', 'SMOKE_OTHER_CUSTOMER_PHONE',
] as const

const JWT_PATTERN = /eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}/g
const BEARER_PATTERN = /Bearer\s+[\w.~+/-]+=*/gi
const COOKIE_PATTERN = /((?:set-)?cookie['":\s=]+)[^\n]+/gi

/** Valores sensibles a ocultar. El celular se enmascara también sin espacios ni prefijo. */
export function secretValues(env: NodeJS.ProcessEnv = process.env): string[] {
  const values = new Set<string>()
  for (const name of SECRET_ENV_NAMES) {
    const value = env[name]
    if (!value) continue
    values.add(value)
    if (name === 'SMOKE_CUSTOMER_PHONE' || name === 'SMOKE_OTHER_CUSTOMER_PHONE') {
      const digits = value.replace(/\D/g, '')
      if (digits.length >= 10) values.add(digits.slice(-10))
    }
  }
  return [...values].filter((value) => value.length >= 4).sort((a, b) => b.length - a.length)
}

export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let clean = text
  for (const value of secretValues(env)) clean = clean.split(value).join('[oculto]')
  return clean
    .replace(JWT_PATTERN, '[jwt]')
    .replace(BEARER_PATTERN, 'Bearer [oculto]')
    .replace(COOKIE_PATTERN, '$1[oculto]')
}
