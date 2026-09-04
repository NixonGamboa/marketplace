import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { config } from '../../shared/config.js'
import * as schema from './schema.js'

if (!config.DATABASE_URL) {
  throw new Error('DATABASE_URL is required when DB_DRIVER=postgres')
}

const sql = neon(config.DATABASE_URL)
export const db = drizzle(sql, { schema })
export type Db = typeof db
