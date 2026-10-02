import { defineConfig } from 'drizzle-kit'
// Drizzle carga este archivo fuente con su loader CJS: la extensión real evita
// buscar un .js que no existe (los otros runtimes usan su resolver TypeScript).
import { getPostgresUrl, loadConfig } from './src/shared/config.ts'

// Generar/verificar/exportar SQL no conecta a una BD ni requiere credenciales.
const offline = ['generate', 'check', 'export'].includes(process.argv[2] ?? '')
const databaseCredentials = offline
  ? {}
  : { dbCredentials: { url: getPostgresUrl(loadConfig(process.env)) } }

export default defineConfig({
  schema: './src/infra/postgres/schema.ts',
  out: './src/infra/postgres/migrations',
  dialect: 'postgresql',
  ...databaseCredentials,
  strict: true,
  verbose: true,
})
