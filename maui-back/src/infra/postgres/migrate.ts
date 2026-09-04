import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { config } from '../../shared/config.js'
import { logger } from '../../shared/logger.js'

const run = async (): Promise<void> => {
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL missing')
  const sql = neon(config.DATABASE_URL)
  const db = drizzle(sql)
  logger.info('Running migrations...')
  await migrate(db, { migrationsFolder: './src/infra/postgres/migrations' })
  logger.info('Migrations complete')
}

run().catch((err) => {
  logger.error({ err }, 'Migration failed')
  process.exit(1)
})
