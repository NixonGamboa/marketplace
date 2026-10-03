import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { is } from 'drizzle-orm'
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import * as schema from '../../src/infra/postgres/schema.js'
import { startEmbeddedPostgres, type EmbeddedPostgres } from './pgliteNeon.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

const MIGRATIONS = new URL('../../src/infra/postgres/migrations/', import.meta.url)
const journal = z.object({ entries: z.array(z.object({ idx: z.number(), tag: z.string(), when: z.number() })) })
  .parse(JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8'))).entries
const snapshotOf = (index: number) => JSON.parse(readFileSync(new URL(`meta/${String(index).padStart(4, '0')}_snapshot.json`, MIGRATIONS), 'utf8')) as { id: string; prevId: string }
const tables = (Object.values(schema).filter(value => is(value, PgTable)) as PgTable[]).map(table => getTableConfig(table))
// drizzle-kit/api solo carga como CJS bajo Node ESM.
const kit = createRequire(import.meta.url)('drizzle-kit/api') as {
  generateDrizzleJson(imports: Record<string, unknown>, prevId?: string): unknown
  generateMigration(previous: unknown, current: unknown): Promise<string[]>
}

/**
 * Coherencia entre `schema.ts` (lo que genera el SQL de los adapters), las migraciones SQL que se
 * aplican en cada ambiente y su ledger. Detecta una edición del esquema sin migración, una
 * migración que Drizzle omitiría por su `when` y diferencias entre el SQL aplicado y el esquema.
 */
describe('migraciones y esquema PostgreSQL', () => {
  describe('journal y snapshots', () => {
    it('índices consecutivos, `when` estrictamente creciente y archivos presentes', () => {
      expect(journal.length).toBeGreaterThan(0)
      journal.forEach((entry, position) => {
        expect(entry.idx).toBe(position)
        expect(entry.tag.startsWith(String(position).padStart(4, '0'))).toBe(true)
        expect(existsSync(new URL(`${entry.tag}.sql`, MIGRATIONS)), entry.tag).toBe(true)
        expect(existsSync(new URL(`meta/${String(position).padStart(4, '0')}_snapshot.json`, MIGRATIONS)), entry.tag).toBe(true)
      })
      // El migrador de Drizzle solo aplica entradas con `when` mayor que la última aplicada.
      journal.slice(1).forEach((entry, position) => expect(entry.when, entry.tag).toBeGreaterThan(journal[position]!.when))
    })

    it('la cadena de snapshots es lineal: cada prevId es el id del anterior', () => {
      for (let position = 1; position < journal.length; position += 1) expect(snapshotOf(position).prevId, journal[position]!.tag).toBe(snapshotOf(position - 1).id)
    })

    it('schema.ts no tiene cambios pendientes de migración respecto al último snapshot', async () => {
      const last = snapshotOf(journal.length - 1)
      expect(await kit.generateMigration(last, kit.generateDrizzleJson(schema, last.id))).toEqual([])
      // Control: contra el snapshot anterior sí hay diferencias, por lo que la comprobación puede fallar.
      const previous = snapshotOf(journal.length - 2)
      expect((await kit.generateMigration(previous, kit.generateDrizzleJson(schema, previous.id))).length).toBeGreaterThan(0)
    })
  })

  describe('SQL aplicado frente a schema.ts', () => {
    let embedded: EmbeddedPostgres
    beforeAll(async () => { embedded = await startEmbeddedPostgres() })
    afterAll(async () => { await embedded?.close() })

    const rows = async <T extends object>(text: string, params: unknown[] = []): Promise<T[]> => (await embedded.pg.query<T>(text, params)).rows

    it('cada tabla existe con las mismas columnas, tipos y nulabilidad (JSONB y timestamptz incluidos)', async () => {
      const actual = await rows<{ table_name: string; column_name: string; type: string; nullable: boolean }>(`
        select c.relname as table_name, a.attname as column_name, format_type(a.atttypid, a.atttypmod) as type, not a.attnotnull as nullable
        from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped`)
      expect([...new Set(actual.map(row => row.table_name))].sort()).toEqual(tables.map(table => table.name).sort())
      for (const table of tables) {
        const declared = table.columns.map(column => ({ column_name: column.name, type: column.getSQLType(), nullable: !column.notNull }))
        const applied = actual.filter(row => row.table_name === table.name).map(({ table_name: _table, ...rest }) => rest)
        expect(applied.sort((a, b) => a.column_name.localeCompare(b.column_name)), table.name)
          .toEqual(declared.sort((a, b) => a.column_name.localeCompare(b.column_name)))
      }
      expect(tables.flatMap(table => table.columns).filter(column => column.getSQLType() === 'timestamp').map(column => column.name)).toEqual([])
    })

    it('índices, únicos, CHECK y claves foráneas declarados existen con su nombre', async () => {
      const present = new Set((await rows<{ name: string }>(`select indexname as name from pg_indexes where schemaname = 'public'
        union select conname from pg_constraint where connamespace = 'public'::regnamespace`)).map(row => row.name))
      const declared = tables.flatMap(table => [
        ...table.indexes.flatMap(index => index.config.name ? [index.config.name] : []),
        ...table.uniqueConstraints.map(unique => unique.getName()),
        ...table.checks.map(check => check.name),
        ...table.foreignKeys.map(foreignKey => foreignKey.getName()),
        ...(table.primaryKeys.map(key => key.getName())),
      ].filter((name): name is string => name !== undefined))
      expect(declared.length).toBeGreaterThan(20)
      expect(declared.filter(name => !present.has(name))).toEqual([])
    })

    it('las claves foráneas conservan su acción de borrado', async () => {
      const applied = await rows<{ name: string; action: string }>(`select conname as name, confdeltype as action from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`)
      const code: Record<string, string> = { 'no action': 'a', cascade: 'c', 'set null': 'n', restrict: 'r', 'set default': 'd' }
      for (const foreignKey of tables.flatMap(table => table.foreignKeys)) {
        expect(applied.find(row => row.name === foreignKey.getName())?.action, foreignKey.getName()).toBe(code[foreignKey.onDelete ?? 'no action'])
      }
    })

    it('las funciones transaccionales existen, se ejecutan con los privilegios de quien las llama y fijan search_path', async () => {
      const functions = await rows<{ name: string; definer: boolean; config: string[] | null }>(`
        select proname as name, prosecdef as definer, proconfig as config from pg_proc where pronamespace = 'public'::regnamespace order by proname`)
      expect(functions.map(fn => fn.name)).toEqual(['maui_commit_order', 'maui_commit_order_audited'])
      for (const fn of functions) {
        expect(fn.definer, fn.name).toBe(false)
        expect(fn.config, fn.name).toEqual(['search_path=pg_catalog'])
      }
    })
  })
})
