import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/infra/postgres/schema.ts',
  out: './src/infra/postgres/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
})
