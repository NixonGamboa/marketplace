import { defineConfig } from 'drizzle-kit'
import { getPostgresUrl, loadConfig } from './src/shared/config.js'

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
