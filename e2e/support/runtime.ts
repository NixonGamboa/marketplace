/**
 * Registro local de la corrida para que el orquestador limpie o audite: solo claves de idempotencia,
 * IDs de pedido y estado del override de tienda. Sin cuerpos, cuentas, cookies ni secretos.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const LOCAL_DIR = fileURLToPath(new URL('../../orquestacion-local/', import.meta.url))
export const ARTIFACTS_DIR = `${LOCAL_DIR}e2e-artifacts/`
const RUNTIME_FILE = `${LOCAL_DIR}e2e-runtime.json`

export interface StoreOverrideRecord {
  original: string
  applied: string
  restored: boolean
}

export interface RuntimeRecord {
  block: 'T-22'
  phase: string
  startedAt: string
  previewSha: string | null
  readyStamp: string | null
  orders: { key: string; orderId?: string }[]
  override?: StoreOverrideRecord
  sessionsClosed?: boolean
  findings: string[]
}

export function readPreviousRuntime(): RuntimeRecord | null {
  try { return JSON.parse(readFileSync(RUNTIME_FILE, 'utf8')) as RuntimeRecord } catch { return null }
}

export function createRuntime(previewSha: string | null, readyStamp: string | null): RuntimeRecord {
  const record: RuntimeRecord = {
    block: 'T-22', phase: 'prepared', startedAt: new Date().toISOString(),
    previewSha, readyStamp, orders: [], findings: [],
  }
  saveRuntime(record)
  return record
}

export function saveRuntime(record: RuntimeRecord, phase?: string): void {
  if (phase) record.phase = phase
  mkdirSync(LOCAL_DIR, { recursive: true })
  writeFileSync(RUNTIME_FILE, JSON.stringify(record, null, 2))
}
