import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { getConfig, getPostgresUrl } from '../../shared/config.js'
import * as schema from './schema.js'

const config = getConfig()
export const sql = neon(getPostgresUrl(config))
export const db = drizzle(sql, { schema })
export type Db = typeof db
