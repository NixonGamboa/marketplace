/**
 * @spec TASK-005, RN-10, §6.6
 * FIFO 500, orden descendente por at, generación de id.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockAuditRepository, AUDIT_MAX_EVENTS, _clearAuditLog } from '../mockAuditRepository'

beforeEach(() => {
  _clearAuditLog()
})

describe('mockAuditRepository', () => {
  it('AC-1: log() persiste evento con id y at generados', async () => {
    await mockAuditRepository.log({
      user: 'owner@x',
      action: 'auth.login',
    })
    const events = await mockAuditRepository.list()
    expect(events).toHaveLength(1)
    expect(events[0].id).toBeTruthy()
    expect(events[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(events[0].user).toBe('owner@x')
  })

  it('AC-2: list(limit) retorna últimos N en orden cronológico inverso', async () => {
    vi.useFakeTimers()
    try {
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(new Date(2026, 5, 1, 10, i))
        await mockAuditRepository.log({
          user: `u${i}`,
          action: 'order.status_changed',
          targetId: `MAUI-${i}`,
        })
      }
    } finally {
      vi.useRealTimers()
    }
    const events = await mockAuditRepository.list(3)
    expect(events).toHaveLength(3)
    // el más reciente (u4) va primero
    expect(events[0].user).toBe('u4')
    expect(events[1].user).toBe('u3')
    expect(events[2].user).toBe('u2')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-3: al superar 500 se descarta el más antiguo (FIFO)', async () => {
    // Sembramos directamente para evitar 501 delays de tests.
    const seed = Array.from({ length: AUDIT_MAX_EVENTS }, (_, i) => ({
      id: `seed-${i}`,
      user: `seed-${i}`,
      action: 'auth.login' as const,
      at: new Date(2020, 0, 1, 0, i).toISOString(),
    }))
    window.localStorage.setItem('maui-admin-audit', JSON.stringify(seed))

    await mockAuditRepository.log({
      user: 'winner',
      action: 'auth.login',
    })

    const events = await mockAuditRepository.list()
    expect(events).toHaveLength(AUDIT_MAX_EVENTS)
    // El más antiguo (seed-0) debe haber sido descartado.
    expect(events.some((e) => e.user === 'seed-0')).toBe(false)
    // El nuevo evento debe estar presente y ser el más reciente.
    expect(events[0].user).toBe('winner')
  })
})
