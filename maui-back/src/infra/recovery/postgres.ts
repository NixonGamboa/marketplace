import { neon } from '@neondatabase/serverless'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { TABLES, RecoveryError, canonical, validateSnapshot, type Snapshot } from './format.js'

// Identificadores exclusivamente del allowlist del código; los valores siempre son parámetros.
const tableList = TABLES.map(table => `'${table}'`).join(',')
export const SNAPSHOT_SQL = `jsonb_build_object(
  'database', current_database(),
  'schema', jsonb_build_object(
    'columns', (SELECT jsonb_agg(jsonb_build_object('table',table_name,'name',column_name,'type',data_type,'nullable',is_nullable='YES','position',ordinal_position) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${tableList})),
    'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object('table',r.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY r.relname,c.conname),'[]'::jsonb) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname IN (${tableList})),
    'indexes', (SELECT coalesce(jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) ORDER BY tablename,indexname),'[]'::jsonb) FROM pg_indexes WHERE schemaname='public' AND tablename IN (${tableList})),
    'functions', (SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname,p.oid),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'maui_%')),
  'ledger', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]'::jsonb) FROM drizzle.__drizzle_migrations m),
  'tables', jsonb_build_object(${TABLES.map(table => `'${table}',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM public.${table} t)`).join(',')}))`

export const verifyLedger = async (snapshot: Snapshot): Promise<void> => {
  const directory = new URL('../postgres/migrations/', import.meta.url)
  const journal = JSON.parse(await readFile(new URL('meta/_journal.json', directory), 'utf8')) as { entries: { tag: string; when: number }[] }
  if (snapshot.ledger.length !== journal.entries.length) throw new RecoveryError('INCOMPATIBLE_LEDGER')
  for (const [index, entry] of journal.entries.entries()) {
    const text = (await readFile(new URL(`${entry.tag}.sql`, directory), 'utf8')).replace(/\r\n/g, '\n')
    const hash = createHash('sha256').update(text).digest('hex')
    const row = snapshot.ledger[index]
    if (!row || row.hash !== hash || String(row.created_at) !== String(entry.when)) throw new RecoveryError('INCOMPATIBLE_LEDGER')
  }
}

export class RecoveryPostgres {
  private readonly sql
  constructor(url: string) { this.sql = neon(url) }
  async snapshot(): Promise<Snapshot> {
    const rows = await this.sql(`SELECT ${SNAPSHOT_SQL} AS snapshot`)
    const snapshot = validateSnapshot(rows[0]?.snapshot)
    await verifyLedger(snapshot)
    return snapshot
  }
  async restore(backup: Snapshot, before: Snapshot): Promise<void> {
    if (canonical(backup.schema) !== canonical(before.schema) || canonical(backup.ledger) !== canonical(before.ledger)) throw new RecoveryError('INCOMPATIBLE_SCHEMA')
    await verifyLedger(backup)
    const queries = [
      this.sql('SET LOCAL lock_timeout = \'10s\''),
      this.sql(`LOCK TABLE ${TABLES.map(table => `public.${table}`).join(',')}, drizzle.__drizzle_migrations IN ACCESS EXCLUSIVE MODE`),
      // El guard se repite bajo locks en la misma transacción; división por cero aborta sin borrar.
      this.sql(`SELECT 1 / ((${SNAPSHOT_SQL} = $1::jsonb)::int) AS unchanged`, [canonical(before)]),
      this.sql(`TRUNCATE TABLE ${TABLES.map(table => `public.${table}`).join(',')}`),
      ...TABLES.map(table => this.sql(`INSERT INTO public.${table} SELECT * FROM jsonb_populate_recordset(NULL::public.${table}, $1::jsonb)`, [JSON.stringify(backup.tables[table])])),
      // FK/CHECK de PostgreSQL y comparación completa: un fallo revierte también el TRUNCATE.
      this.sql(`SELECT 1 / ((${SNAPSHOT_SQL} = $1::jsonb)::int) AS restored`, [canonical(backup)]),
    ]
    await this.sql.transaction(queries)
  }
}
