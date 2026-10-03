import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ loadPage: vi.fn() }))
vi.mock('@/services', () => ({ orderPages: { loadPage: mocks.loadPage } }))
vi.mock('@/auth/useSession', () => ({ useSession: () => ({ session: { user: { email: 'owner', merchantId: 'store' }, expiresAt: '2030' } }) }))
import { useRealNewOrdersWatcher } from '../useRealNewOrdersWatcher'
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
describe('alertas reales optativas', () => {
  it('baseline sin alerta; dedup ID incluso con otra versión y recuperación tras fallo', async () => {
    const onNew = vi.fn()
    mocks.loadPage.mockResolvedValueOnce({ items: [{ orderId: 'uno', version: 1 }], nextCursor: null })
      .mockResolvedValueOnce({ items: [{ orderId: 'uno', version: 2 }, { orderId: 'dos', version: 1 }], nextCursor: null })
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValue({ items: [{ orderId: 'dos', version: 2 }], nextCursor: null })
    const { result } = renderHook(() => useRealNewOrdersWatcher(onNew, true))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(onNew).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'dos' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(result.current).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(result.current).toBe(false)
    expect(onNew).toHaveBeenCalledTimes(1)
  })
  it('sin activar no consulta; desactivar aborta una lectura pendiente', async () => {
    mocks.loadPage.mockImplementation(() => new Promise(() => undefined))
    const { rerender } = renderHook(({ enabled }) => useRealNewOrdersWatcher(vi.fn(), enabled), { initialProps: { enabled: false } })
    expect(mocks.loadPage).not.toHaveBeenCalled()
    rerender({ enabled: true })
    const signal = mocks.loadPage.mock.calls[0][2].signal as AbortSignal
    rerender({ enabled: false })
    expect(signal.aborted).toBe(true)
  })
})
