import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { getConfig, getPostgresUrl } from '../../shared/config.js'

const run = async (): Promise<void> => {
  const config = getConfig()
  const databaseUrl = getPostgresUrl(config)
  const { logger } = await import('../../shared/logger.js')
  const sql = neon(databaseUrl)
  const db = drizzle(sql)
  logger.info('Running migrations...')
  await migrate(db, { migrationsFolder: './src/infra/postgres/migrations' })
  logger.info('Migrations complete')
}

run().catch(() => {
  console.error('Migration failed: verify server configuration and database availability')
  process.exit(1)
})
