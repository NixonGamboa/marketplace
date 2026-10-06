import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { z } from 'zod'
import type { Db } from '../../src/infra/postgres/client.js'
import * as schema from '../../src/infra/postgres/schema.js'

const querySchema = z.object({ query: z.string(), params: z.array(z.unknown()) })
const requestSchema = z.union([querySchema, z.object({ queries: z.array(querySchema) })])
const journalSchema = z.object({ entries: z.array(z.object({ tag: z.string() })) })

export interface EmbeddedPostgres {
  pg: PGlite
  db: Db
  close(): Promise<void>
}

/**
 * PostgreSQL embebido con todas las migraciones del journal. Solo se sustituye el transporte
 * HTTP de Neon: Drizzle y los adapters de producción generan SQL; PostgreSQL ejecuta
 * restricciones, joins y upserts. No contacta Neon ni usa credenciales; no acredita el smoke cloud.
 */
export async function startEmbeddedPostgres(
  options: { beforeMigration?: Readonly<Record<string, (pg: PGlite) => Promise<void>>> } = {},
): Promise<EmbeddedPostgres> {
  const pg = await PGlite.create()
  const migrations = new URL('../../src/infra/postgres/migrations/', import.meta.url)
  const journal = journalSchema.parse(JSON.parse(readFileSync(new URL('meta/_journal.json', migrations), 'utf8')))
  for (const entry of journal.entries) {
    // Datos previos a una migración concreta (p. ej. filas legacy para probar su backfill).
    await options.beforeMigration?.[entry.tag]?.(pg)
    await pg.exec(readFileSync(new URL(`${entry.tag}.sql`, migrations), 'utf8'))
  }

  const originalFetch = neonConfig.fetchFunction
  neonConfig.fetchFunction = async (_url: unknown, init: RequestInit): Promise<Response> => {
    if (typeof init.body !== 'string') throw new Error('Body SQL inesperado')
    const request = requestSchema.parse(JSON.parse(init.body))
    const execute = async (query: z.infer<typeof querySchema>, client: Pick<PGlite, 'query'> = pg) => {
      const result = await client.query<unknown[]>(query.query, query.params, { rowMode: 'array' })
      const rows = result.rows.map(row => row.map(value => {
        if (value === null) return null
        if (value instanceof Date) return value.toISOString()
        if (typeof value === 'boolean') return value ? 't' : 'f'
        if (typeof value === 'object') return JSON.stringify(value)
        return String(value)
      }))
      return { rows, fields: result.fields, rowCount: result.affectedRows ?? rows.length }
    }
    try {
      const body = 'queries' in request
        ? { results: await pg.transaction(async tx => {
          const results = []
          for (const query of request.queries) results.push(await execute(query, tx))
          return results
        }) }
        : await execute(request)
      return new Response(JSON.stringify(body), { status: 200 })
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
      return new Response(JSON.stringify({ message: 'SQL fixture rechazado', code }), { status: 400 })
    }
  }

  const db: Db = drizzle(neon('postgresql://fixture:fixture@localhost/fixture'), { schema })
  return {
    pg,
    db,
    async close() {
      neonConfig.fetchFunction = originalFetch
      await pg.close()
    },
  }
}
