/**
 * Registro local de la corrida para que el orquestador limpie o audite: solo claves de idempotencia,
 * IDs de pedido, estado del override de tienda y fixtures técnicos con su snapshot acotado. Sin
 * cuerpos, cuentas, cookies ni secretos.
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

/** Cambio técnico persistente sobre tienda o producto: se registra ANTES de mutar y se restaura siempre. */
export interface FixtureRecord {
  kind: 'store' | 'product'
  id: string
  /** Valores previos de los campos que se tocan. */
  original: Record<string, unknown>
  /** Valores que dejó el cambio por API; ausente si lo edita la UI (restauración incondicional). */
  applied?: Record<string, unknown>
  /** Versión del producto de personal leída antes de mutar (la tienda no está versionada). */
  versionBefore?: number
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
  fixtures?: FixtureRecord[]
  sessionsClosed?: boolean
  findings: string[]
}

export function readPreviousRuntime(): RuntimeRecord | null {
  try { return JSON.parse(readFileSync(RUNTIME_FILE, 'utf8')) as RuntimeRecord } catch { return null }
}

/**
 * Nueva corrida (o nuevo worker tras un fallo). Lo que describe estado vivo del entorno (override y
 * fixtures sin restaurar) se hereda siempre para poder devolverlo; pedidos y hallazgos solo si es el
 * mismo ready, así un reset de root empieza limpio.
 */
export function carryOver(previewSha: string | null, readyStamp: string | null, previous: RuntimeRecord | null): RuntimeRecord {
  const sameReady = readyStamp !== null && previous?.readyStamp === readyStamp
  const pendingFixtures = (previous?.fixtures ?? []).filter((fixture) => !fixture.restored || sameReady)
  const record: RuntimeRecord = {
    block: 'T-22', phase: 'prepared', startedAt: new Date().toISOString(),
    previewSha, readyStamp,
    orders: sameReady ? previous!.orders : [],
    findings: sameReady ? previous!.findings : [],
    ...(previous?.override && (!previous.override.restored || sameReady) ? { override: previous.override } : {}),
    ...(pendingFixtures.length > 0 ? { fixtures: pendingFixtures } : {}),
  }
  return record
}

export function createRuntime(previewSha: string | null, readyStamp: string | null): RuntimeRecord {
  const record = carryOver(previewSha, readyStamp, readPreviousRuntime())
  saveRuntime(record)
  return record
}

export function saveRuntime(record: RuntimeRecord, phase?: string): void {
  if (phase) record.phase = phase
  mkdirSync(LOCAL_DIR, { recursive: true })
  writeFileSync(RUNTIME_FILE, JSON.stringify(record, null, 2))
}
