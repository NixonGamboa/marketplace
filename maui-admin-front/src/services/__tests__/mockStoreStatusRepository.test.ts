/**
 * @spec TASK-009
 * isOpenNow con 3 paths (override open/closed/auto) + límites de horario.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { StoreStatus } from '@/types/storeStatus'
import { mockStoreStatusRepository } from '../mockStoreStatusRepository'
import { SEED_STORE_STATUS } from '../seed/storeStatusSeed'
import { _clearAuditLog, mockAuditRepository } from '../mockAuditRepository'

function seedStatus(status: StoreStatus) {
  window.localStorage.setItem('maui-admin-store', JSON.stringify(status))
}

beforeEach(() => {
  window.localStorage.clear()
  _clearAuditLog()
})

describe('mockStoreStatusRepository.isOpenNow', () => {
  it('AC-3: override=open → true (ignora schedule)', async () => {
    seedStatus({ ...SEED_STORE_STATUS, override: 'open' })
    // Domingo 3am — fuera de cualquier horario razonable
    const dawn = new Date('2026-06-07T03:00:00')
    expect(await mockStoreStatusRepository.isOpenNow(dawn)).toBe(true)
  })

  it('AC-3: override=closed → false (ignora schedule)', async () => {
    seedStatus({ ...SEED_STORE_STATUS, override: 'closed' })
    const noon = new Date('2026-06-08T12:00:00')
    expect(await mockStoreStatusRepository.isOpenNow(noon)).toBe(false)
  })

  it('AC-4: override=auto lunes 10:00 (schedule 08-20) → true', async () => {
    seedStatus({ ...SEED_STORE_STATUS, override: 'auto' })
    // 2026-06-08 fue lunes
    const monTen = new Date(2026, 5, 8, 10, 0)
    expect(await mockStoreStatusRepository.isOpenNow(monTen)).toBe(true)
  })

  it('AC-5: día marcado closed → false aunque haya horario', async () => {
    seedStatus({
      ...SEED_STORE_STATUS,
      override: 'auto',
      schedule: { ...SEED_STORE_STATUS.schedule, sun: { open: '00:00', close: '23:59', closed: true } },
    })
    const sunNoon = new Date(2026, 5, 7, 12, 0) // Domingo 12:00
    expect(await mockStoreStatusRepository.isOpenNow(sunNoon)).toBe(false)
  })

  it('límite exacto de apertura: 08:00 lunes → true', async () => {
    seedStatus({ ...SEED_STORE_STATUS, override: 'auto' })
    const monEight = new Date(2026, 5, 8, 8, 0)
    expect(await mockStoreStatusRepository.isOpenNow(monEight)).toBe(true)
  })

  it('límite exacto de cierre: 20:00 lunes → false (exclusivo)', async () => {
    seedStatus({ ...SEED_STORE_STATUS, override: 'auto' })
    const monEight = new Date(2026, 5, 8, 20, 0)
    expect(await mockStoreStatusRepository.isOpenNow(monEight)).toBe(false)
  })

  it('antes de la apertura: 07:59 lunes → false', async () => {
    seedStatus({ ...SEED_STORE_STATUS, override: 'auto' })
    const monEarly = new Date(2026, 5, 8, 7, 59)
    expect(await mockStoreStatusRepository.isOpenNow(monEarly)).toBe(false)
  })
})

describe('mockStoreStatusRepository.setOverride / setSchedule', () => {
  it('setOverride persiste y registra audit', async () => {
    await mockStoreStatusRepository.setOverride('closed', 'owner@x')
    const status = await mockStoreStatusRepository.get()
    expect(status.override).toBe('closed')
    const events = await mockAuditRepository.list()
    expect(events[0].action).toBe('store.override_changed')
  })

  it('setSchedule persiste y registra audit', async () => {
    const next = {
      ...SEED_STORE_STATUS.schedule,
      mon: { open: '10:00', close: '18:00', closed: false },
    }
    await mockStoreStatusRepository.setSchedule(next, 'owner@x')
    const status = await mockStoreStatusRepository.get()
    expect(status.schedule.mon.open).toBe('10:00')
    const events = await mockAuditRepository.list()
    expect(events[0].action).toBe('store.schedule_changed')
  })
})
