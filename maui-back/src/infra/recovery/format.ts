import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

export const TABLES = ['stores', 'catalog_categories', 'catalog_products', 'auth_accounts', 'auth_sessions', 'auth_rate_limits', 'orders', 'order_creations', 'audit_events'] as const
export type TableName = typeof TABLES[number]
export class RecoveryError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'RecoveryError' }
}
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export const fingerprint = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex')
const columnSchema = z.object({ table: z.enum(TABLES), name: z.string().min(1), type: z.string().min(1), nullable: z.boolean(), position: z.number().int().positive() }).strict()
const metadataSchema = z.object({ columns: z.array(columnSchema).min(1), constraints: z.array(z.record(z.unknown())), indexes: z.array(z.record(z.unknown())), functions: z.array(z.record(z.unknown())) }).strict()
export const snapshotSchema = z.object({ database: z.literal('maui'), schema: metadataSchema,
  ledger: z.array(z.object({ id: z.number().int(), hash: z.string().regex(/^[a-f0-9]{64}$/), created_at: z.union([z.number(), z.string()]) }).strict()).min(1),
  tables: z.object(Object.fromEntries(TABLES.map(table => [table, z.array(z.record(z.unknown()))]))).strict(),
}).strict()
export type Snapshot = z.infer<typeof snapshotSchema>
const backupSchema = z.object({ version: z.literal(1), source: z.literal('dev/maui'), createdAt: z.string().datetime(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), snapshot: snapshotSchema }).strict()
export type Backup = z.infer<typeof backupSchema>
const encryptedSchema = z.object({ version: z.literal(1), algorithm: z.literal('AES-256-GCM'), iv: z.string(), tag: z.string(), ciphertext: z.string() }).strict()
const keyFrom = (key: string): Buffer => {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new RecoveryError('INVALID_BACKUP_KEY')
  return Buffer.from(key, 'hex')
}
const bytesFrom = (value: string, length?: number): Buffer => {
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value || (length !== undefined && bytes.length !== length)) throw new RecoveryError('INVALID_BACKUP')
  return bytes
}
export const validateSnapshot = (input: unknown): Snapshot => {
  const parsed = snapshotSchema.safeParse(input)
  if (!parsed.success) throw new RecoveryError('INVALID_SNAPSHOT')
  const snapshot = parsed.data
  for (const table of TABLES) {
    const columns = snapshot.schema.columns.filter(column => column.table === table)
    if (columns.length === 0 || new Set(columns.map(column => column.name)).size !== columns.length) throw new RecoveryError('INVALID_COLUMNS')
    for (const row of snapshot.tables[table] ?? []) {
      if (Object.keys(row).length !== columns.length) throw new RecoveryError('INVALID_ROW')
      for (const column of columns) {
        if (!Object.hasOwn(row, column.name)) throw new RecoveryError('INVALID_ROW')
        const value = row[column.name]
        if (value === null) { if (!column.nullable) throw new RecoveryError('INVALID_ROW'); continue }
        const valid = column.type === 'jsonb' || column.type === 'json' ? true
          : column.type === 'boolean' ? typeof value === 'boolean'
          : ['integer', 'double precision', 'real', 'numeric', 'bigint', 'smallint'].includes(column.type) ? (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))
          : ['text', 'character varying', 'timestamp with time zone', 'timestamp without time zone'].includes(column.type) ? typeof value === 'string' : false
        if (!valid) throw new RecoveryError('INVALID_COLUMN_TYPE')
      }
    }
  }
  return snapshot
}
export const sealBackup = (snapshot: Snapshot, key: string, now = new Date()): string => {
  validateSnapshot(snapshot)
  const backup: Backup = { version: 1, source: 'dev/maui', createdAt: now.toISOString(), contentHash: fingerprint(snapshot), snapshot }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(key), iv)
  cipher.setAAD(Buffer.from('maui-test-backup-v1'))
  const ciphertext = Buffer.concat([cipher.update(canonical(backup), 'utf8'), cipher.final()])
  return JSON.stringify({ version: 1, algorithm: 'AES-256-GCM', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') })
}
export const openBackup = (input: string, key: string): Backup => {
  const secret = keyFrom(key)
  try {
    const envelope = encryptedSchema.parse(JSON.parse(input))
    const decipher = createDecipheriv('aes-256-gcm', secret, bytesFrom(envelope.iv, 12))
    decipher.setAAD(Buffer.from('maui-test-backup-v1'))
    decipher.setAuthTag(bytesFrom(envelope.tag, 16))
    const plaintext = Buffer.concat([decipher.update(bytesFrom(envelope.ciphertext)), decipher.final()]).toString('utf8')
    const backup = backupSchema.parse(JSON.parse(plaintext))
    validateSnapshot(backup.snapshot)
    if (backup.contentHash !== fingerprint(backup.snapshot)) throw new RecoveryError('INVALID_BACKUP')
    return backup
  } catch { throw new RecoveryError('INVALID_BACKUP') }
}
