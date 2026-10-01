import { z } from 'zod'

const environmentSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'production']),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DB_DRIVER: z.enum(['postgres', 'memory']).default('postgres'),
  DATABASE_URL: z.string().min(1).optional(),
  TEST_DATABASE_HOST: z.string().min(1).optional(),
  TEST_DATABASE_NAME: z.string().min(1).optional(),
  PRODUCTION_DATABASE_HOST: z.string().min(1).optional(),
  PRODUCTION_DATABASE_NAME: z.string().min(1).optional(),
})

export type BackendConfig = z.infer<typeof environmentSchema>

/** Solo contiene códigos de diagnóstico; nunca los valores del entorno. */
export class ConfigurationError extends Error {
  readonly code = 'INVALID_CONFIGURATION'

  constructor(public readonly issues: readonly string[]) {
    super('La configuración del servidor es inválida')
    this.name = 'ConfigurationError'
  }
}

function reject(issue: string): never {
  throw new ConfigurationError([issue])
}

function databaseHost(host: string): string {
  const normalized = host.toLowerCase().replace(/\.$/, '')
  // Pooler y conexión directa de Neon pertenecen al mismo endpoint/branch.
  return normalized.endsWith('.neon.tech')
    ? normalized.replace(/-pooler(?=\.)/, '')
    : normalized
}

function declaredHost(value: string | undefined, key: string): string {
  if (!value || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.?$/i.test(value)) reject(key)
  return databaseHost(value)
}

function declaredDatabase(value: string | undefined, key: string): string {
  if (!value || value.trim() !== value || /[\/\u0000]/.test(value)) reject(key)
  return value
}

function databaseTarget(value: string | undefined): { host: string; database: string } {
  if (!value) reject('DATABASE_URL_REQUIRED')
  try {
    const url = new URL(value)
    // El driver normaliza la URL como HTTP; así también se resuelven hosts
    // percent-encoded, mayúsculas y nombres internacionales antes de comparar.
    const normalized = new URL('http:' + value.slice(url.protocol.length))
    const database = decodeURIComponent(normalized.pathname.slice(1))
    const allowedParameters = new Set(['sslmode', 'channel_binding', 'connect_timeout', 'application_name'])
    for (const key of normalized.searchParams.keys()) {
      if (!allowedParameters.has(key)) reject('DATABASE_URL_QUERY_NOT_ALLOWED')
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
        !url.username || !url.password || !database || /[\/\u0000]/.test(database)) {
      reject('DATABASE_URL_INVALID')
    }
    return { host: databaseHost(normalized.hostname), database }
  } catch (error) {
    if (error instanceof ConfigurationError) throw error
    reject('DATABASE_URL_INVALID')
  }
}

/** Valida aislamiento antes de crear cualquier cliente o ejecutar SQL. */
export function loadConfig(environment: NodeJS.ProcessEnv): BackendConfig {
  const parsed = environmentSchema.safeParse(environment)
  if (!parsed.success) {
    throw new ConfigurationError(parsed.error.issues.map(issue => issue.path.join('.')))
  }

  const settings = parsed.data
  if (settings.VERCEL_ENV === 'preview' && settings.APP_ENV !== 'test') {
    reject('PREVIEW_REQUIRES_TEST')
  }
  if (settings.VERCEL_ENV === 'production' && settings.APP_ENV !== 'production') {
    reject('PRODUCTION_REQUIRES_PRODUCTION')
  }
  if (settings.APP_ENV === 'production' && settings.NODE_ENV !== 'production') {
    reject('PRODUCTION_REQUIRES_PRODUCTION_RUNTIME')
  }

  if (settings.DB_DRIVER === 'memory') {
    const deployed = settings.VERCEL_ENV === 'preview' || settings.VERCEL_ENV === 'production'
    const localOrUnitTest = settings.APP_ENV === 'local' || settings.NODE_ENV === 'test'
    if (deployed || !localOrUnitTest || settings.APP_ENV === 'production' ||
        settings.NODE_ENV === 'production') reject('MEMORY_DRIVER_NOT_ALLOWED')
    return settings
  }

  const actual = databaseTarget(settings.DATABASE_URL)
  if (settings.APP_ENV === 'local') {
    if (settings.PRODUCTION_DATABASE_HOST && actual.host ===
        declaredHost(settings.PRODUCTION_DATABASE_HOST, 'PRODUCTION_DATABASE_HOST_INVALID')) {
      reject('LOCAL_TARGETS_PRODUCTION')
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(actual.host)) {
      reject('REMOTE_DATABASE_REQUIRES_DECLARED_ENVIRONMENT')
    }
    return settings
  }

  const testHost = declaredHost(settings.TEST_DATABASE_HOST, 'TEST_DATABASE_HOST_REQUIRED')
  const productionHost = declaredHost(settings.PRODUCTION_DATABASE_HOST, 'PRODUCTION_DATABASE_HOST_REQUIRED')
  const testDatabase = declaredDatabase(settings.TEST_DATABASE_NAME, 'TEST_DATABASE_NAME_REQUIRED')
  const productionDatabase = declaredDatabase(settings.PRODUCTION_DATABASE_NAME, 'PRODUCTION_DATABASE_NAME_REQUIRED')
  if (testHost === productionHost) reject('DATABASE_ENDPOINTS_NOT_ISOLATED')

  if (settings.APP_ENV === 'test') {
    if (actual.host === productionHost) reject('TEST_TARGETS_PRODUCTION')
    if (actual.host !== testHost || actual.database !== testDatabase) reject('TEST_DATABASE_TARGET_MISMATCH')
  } else if (actual.host !== productionHost || actual.database !== productionDatabase) {
    reject('PRODUCTION_DATABASE_TARGET_MISMATCH')
  }

  return settings
}

let cachedConfig: BackendConfig | undefined

/** Se evalúa dentro de la operación, para que HTTP pueda manejar el fallo. */
export function getConfig(): BackendConfig {
  return cachedConfig ??= loadConfig(process.env)
}

/** Las herramientas que acceden a Postgres nunca ignoran DB_DRIVER. */
export function getPostgresUrl(settings: BackendConfig): string {
  if (settings.DB_DRIVER !== 'postgres' || !settings.DATABASE_URL) {
    reject('POSTGRES_DRIVER_REQUIRED')
  }
  return settings.DATABASE_URL
}
