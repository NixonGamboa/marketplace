// Seed inicial del StoreStatus — idempotente vía marker.

import type { StoreStatus } from '@/types/storeStatus'

const STORAGE_KEY = 'maui-admin-store'
const SEED_MARKER = 'maui-admin-store-seeded-v1'

// Horario por defecto: Lun-Sáb 08:00-20:00, Dom 09:00-14:00.
export const SEED_STORE_STATUS: StoreStatus = {
  override: 'auto',
  schedule: {
    mon: { open: '08:00', close: '20:00', closed: false },
    tue: { open: '08:00', close: '20:00', closed: false },
    wed: { open: '08:00', close: '20:00', closed: false },
    thu: { open: '08:00', close: '20:00', closed: false },
    fri: { open: '08:00', close: '20:00', closed: false },
    sat: { open: '08:00', close: '20:00', closed: false },
    sun: { open: '09:00', close: '14:00', closed: false },
  },
  updatedAt: new Date('2026-06-11T00:00:00.000Z').toISOString(),
}

export function runStoreStatusSeed(): void {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(SEED_MARKER) === '1') return
  if (!window.localStorage.getItem(STORAGE_KEY)) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_STORE_STATUS))
  }
  window.localStorage.setItem(SEED_MARKER, '1')
}
