/**
 * @spec §10, ADR-003, TASK-019 — Tests del hook useNewOrdersWatcher.
 * Verifica que el hook llama onNew exactamente una vez por pedido nuevo
 * y no re-alerta sobre pedidos ya conocidos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Order } from '@/types/orderService'
import { useNewOrdersWatcher } from '../useNewOrdersWatcher'

const STORAGE_KEY = 'maui-orders'
const KNOWN_IDS_KEY = 'maui-admin-known-order-ids'

function makeOrder(partial: Partial<Order> & { orderId: string }): Order {
  return {
    userId: 'user-1',
    status: 'received',
    items: [],
    deliveryType: 'pickup',
    deliveryData: {},
    substitutionPreference: 'similar',
    customerName: 'Test User',
    estimatedTotal: 10000,
    createdAt: new Date().toISOString(),
    ...partial,
  }
}

function dispatchStorageEvent(orders: Record<string, Order>): void {
  const event = new StorageEvent('storage', {
    key: STORAGE_KEY,
    newValue: JSON.stringify(orders),
    oldValue: null,
    storageArea: localStorage,
  })
  window.dispatchEvent(event)
}

describe('useNewOrdersWatcher', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AC-1: llama onNew una vez cuando llega un pedido received nuevo', () => {
    const onNew = vi.fn()
    renderHook(() => useNewOrdersWatcher(onNew))

    const order = makeOrder({ orderId: 'MAUI-X', status: 'received' })
    dispatchStorageEvent({ 'MAUI-X': order })

    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'MAUI-X' }))
  })

  it('AC-2: no llama onNew si el mismo pedido ya fue procesado', () => {
    const onNew = vi.fn()
    renderHook(() => useNewOrdersWatcher(onNew))

    const order = makeOrder({ orderId: 'MAUI-X', status: 'received' })

    // Primer dispatch
    dispatchStorageEvent({ 'MAUI-X': order })
    expect(onNew).toHaveBeenCalledTimes(1)

    // Segundo dispatch con el mismo id — no debe re-alertar
    dispatchStorageEvent({ 'MAUI-X': order })
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('no llama onNew para pedidos con status distinto de received', () => {
    const onNew = vi.fn()
    renderHook(() => useNewOrdersWatcher(onNew))

    const order = makeOrder({ orderId: 'MAUI-Y', status: 'confirmed' })
    dispatchStorageEvent({ 'MAUI-Y': order })

    expect(onNew).not.toHaveBeenCalled()
  })

  it('no llama onNew para eventos storage con key diferente', () => {
    const onNew = vi.fn()
    renderHook(() => useNewOrdersWatcher(onNew))

    const event = new StorageEvent('storage', {
      key: 'otra-key',
      newValue: JSON.stringify({}),
      storageArea: localStorage,
    })
    window.dispatchEvent(event)

    expect(onNew).not.toHaveBeenCalled()
  })

  it('persiste ids conocidos en sessionStorage después de procesar', () => {
    const onNew = vi.fn()
    renderHook(() => useNewOrdersWatcher(onNew))

    const order = makeOrder({ orderId: 'MAUI-Z', status: 'received' })
    dispatchStorageEvent({ 'MAUI-Z': order })

    const stored = JSON.parse(sessionStorage.getItem(KNOWN_IDS_KEY) ?? '[]') as string[]
    expect(stored).toContain('MAUI-Z')
  })

  it('no vuelve a alertar sobre pedidos ya en localStorage al montar', () => {
    // Pre-carga órdenes en localStorage antes de montar el hook
    const preExisting = makeOrder({ orderId: 'MAUI-PREV', status: 'received' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'MAUI-PREV': preExisting }))

    const onNew = vi.fn()
    renderHook(() => useNewOrdersWatcher(onNew))

    // El hook no debe alertar por pedidos ya existentes al montar
    expect(onNew).not.toHaveBeenCalled()

    // Pero sí alerta por uno nuevo después del montaje
    const fresh = makeOrder({ orderId: 'MAUI-NEW', status: 'received' })
    dispatchStorageEvent({ 'MAUI-PREV': preExisting, 'MAUI-NEW': fresh })
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'MAUI-NEW' }))
  })
})
