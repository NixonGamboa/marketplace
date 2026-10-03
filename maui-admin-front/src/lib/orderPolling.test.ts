import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { latestOrder, latestOrderList, orderPollingInterval, startOrderPolling } from './orderPolling'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('seguimiento periódico', () => {
  it('no solapa requests, deduplica reactivaciones y cancela al cerrar', async () => {
    let finish!: () => void
    const load = vi.fn((_signal: AbortSignal) => new Promise<void>((done) => { finish = done }))
    const poll = startOrderPolling(load, vi.fn(), 30_000)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
    poll.refresh()
    poll.refresh()
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(2)
    const signal = load.mock.calls[1][0] as AbortSignal
    poll.stop()
    expect(signal.aborted).toBe(true)
    finish()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('hidden aborta; una respuesta tardía no publica datos y foreground reconcilia', async () => {
    let finish!: () => void
    const seen: number[] = []
    let requests = 0
    const load = vi.fn(async (signal: AbortSignal) => {
      requests += 1
      if (requests === 1) await new Promise<void>((done) => { finish = done })
      if (!signal.aborted) seen.push(requests)
    })
    const poll = startOrderPolling(load, vi.fn(), 30_000)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(load.mock.calls[0][0].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(2)
    expect(seen).toEqual([2])
    poll.stop()
  })

  it('offline pausa y online reintenta tras un fallo sin inventar resultados', async () => {
    const failure = vi.fn()
    const load = vi.fn().mockRejectedValueOnce(new Error('red')).mockResolvedValue(undefined)
    const poll = startOrderPolling(load, failure, 30_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(failure).toHaveBeenCalledTimes(1)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(90_000)
    expect(load).toHaveBeenCalledTimes(1)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(2)
    poll.stop()
  })

  it('versiones repetidas o anteriores no reemplazan el estado; IDs repetidos no duplican filas', () => {
    const current = { orderId: 'uno', version: 3, status: 'cancelled', finalTotal: 12000 }
    expect(latestOrder(current, { ...current, version: 2, status: 'received' })).toBe(current)
    expect(latestOrderList([current], [{ ...current }, { ...current, version: 2 }])).toEqual([current])
    const updated = { ...current, version: 4, finalTotal: 15000 }
    expect(latestOrderList([current], [updated, current])).toEqual([updated])
  })

  it('solo acepta configuración entre 30 y 60 segundos', () => {
    expect(orderPollingInterval('60000')).toBe(60000)
    expect(orderPollingInterval('30000')).toBe(30000)
    expect(orderPollingInterval('5000')).toBe(30000)
    expect(orderPollingInterval('incorrecto')).toBe(30000)
  })
})
