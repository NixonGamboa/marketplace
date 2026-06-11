// Audit log mock — FIFO de 500 entradas en localStorage (RN-10, §6.6).
//
// `log()` inserta un evento generando `id` (UUID) y `at` (ISO now). Si la lista
// ya tiene 500 entradas, descarta la más antigua (FIFO).
// `list(limit?)` devuelve los eventos del más nuevo al más viejo.

import type { AuditAction, AuditEvent } from '@/types/audit'
import { randomDelay } from './delay'

const STORAGE_KEY = 'maui-admin-audit'
const MAX_EVENTS = 500

export interface AuditRepository {
  log(event: Omit<AuditEvent, 'id' | 'at'>): Promise<void>
  list(limit?: number): Promise<AuditEvent[]>
}

function readAll(): AuditEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AuditEvent[]) : []
  } catch {
    return []
  }
}

function writeAll(events: AuditEvent[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback determinista para entornos sin crypto.randomUUID (jsdom viejo).
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const mockAuditRepository: AuditRepository = {
  async log(event) {
    await randomDelay()
    const all = readAll()
    const next: AuditEvent = {
      ...event,
      id: newId(),
      at: new Date().toISOString(),
    }
    all.push(next)
    // FIFO: si excede el tope, descarta los más antiguos (head del array).
    while (all.length > MAX_EVENTS) all.shift()
    writeAll(all)
  },

  async list(limit) {
    await randomDelay()
    const all = readAll().slice().sort((a, b) => b.at.localeCompare(a.at))
    return typeof limit === 'number' ? all.slice(0, limit) : all
  },
}

export const realAuditRepository: AuditRepository = {
  log() {
    throw new Error('realAuditRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  list() {
    throw new Error('realAuditRepository not implemented (swap from VITE_DEMO_MODE)')
  },
}

/** Helper interno: borra el log (sólo para `ResetDemoButton`). */
export function _clearAuditLog(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

/** Para tests: límite expuesto en read-only. */
export const AUDIT_MAX_EVENTS = MAX_EVENTS
