// Mock StoreStatusRepository — override + horario semanal en localStorage.

import type {
  DayHours,
  StoreOverride,
  StoreStatus,
  WeeklySchedule,
} from '@/types/storeStatus'
import { mockAuditRepository } from './mockAuditRepository'
import { randomDelay } from './delay'
import { SEED_STORE_STATUS } from './seed/storeStatusSeed'

const STORAGE_KEY = 'maui-admin-store'

export interface StoreStatusRepository {
  get(): Promise<StoreStatus>
  setOverride(override: StoreOverride, by: string): Promise<StoreStatus>
  setSchedule(schedule: WeeklySchedule, by: string): Promise<StoreStatus>
  isOpenNow(now?: Date): Promise<boolean>
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = (typeof DAY_KEYS)[number]

function readStatus(): StoreStatus {
  if (typeof window === 'undefined') return SEED_STORE_STATUS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return SEED_STORE_STATUS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return SEED_STORE_STATUS
    return parsed as StoreStatus
  } catch {
    return SEED_STORE_STATUS
  }
}

function writeStatus(status: StoreStatus): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(status))
}

/** Convierte "HH:MM" a minutos desde medianoche. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

function isWithinSchedule(day: DayHours, now: Date): boolean {
  if (day.closed) return false
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const openM = toMinutes(day.open)
  const closeM = toMinutes(day.close)
  if (closeM <= openM) return false
  return minutesNow >= openM && minutesNow < closeM
}

export const mockStoreStatusRepository: StoreStatusRepository = {
  async get() {
    await randomDelay()
    return readStatus()
  },

  async setOverride(override, by) {
    await randomDelay()
    const previous = readStatus()
    const updated: StoreStatus = { ...previous, override, updatedAt: new Date().toISOString() }
    writeStatus(updated)
    await mockAuditRepository.log({
      user: by,
      action: 'store.override_changed',
      meta: { from: previous.override, to: override },
    })
    return updated
  },

  async setSchedule(schedule, by) {
    await randomDelay()
    const previous = readStatus()
    const updated: StoreStatus = { ...previous, schedule, updatedAt: new Date().toISOString() }
    writeStatus(updated)
    await mockAuditRepository.log({
      user: by,
      action: 'store.schedule_changed',
      meta: { previous: previous.schedule, next: schedule },
    })
    return updated
  },

  async isOpenNow(now = new Date()) {
    const status = readStatus()
    if (status.override === 'open') return true
    if (status.override === 'closed') return false
    const dayKey: DayKey = DAY_KEYS[now.getDay()]
    const day = status.schedule[dayKey]
    return isWithinSchedule(day, now)
  },
}

export const realStoreStatusRepository: StoreStatusRepository = {
  get() {
    throw new Error('realStoreStatusRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  setOverride() {
    throw new Error('realStoreStatusRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  setSchedule() {
    throw new Error('realStoreStatusRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  isOpenNow() {
    throw new Error('realStoreStatusRepository not implemented (swap from VITE_DEMO_MODE)')
  },
}
