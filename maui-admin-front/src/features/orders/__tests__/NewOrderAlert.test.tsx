/** Aviso de pedido nuevo (ME-04): muestra la referencia comercial y navega con el identificador interno. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Order } from '@/types/orderService'

const watcher = vi.hoisted(() => ({ notify: null as null | ((order: unknown) => void) }))

vi.mock('@/services', () => ({ isDemoMode: true }))
vi.mock('@/lib/audio', () => ({ playNewOrderSound: vi.fn() }))
vi.mock('../useNewOrdersWatcher', () => ({
  useNewOrdersWatcher: (onNew: (order: unknown) => void) => { watcher.notify = onNew },
}))
vi.mock('../useRealNewOrdersWatcher', () => ({ useRealNewOrdersWatcher: () => false }))

import { NewOrderAlert } from '../NewOrderAlert'

const order = (overrides: Partial<Order> = {}): Order => ({
  orderId: 'f3b2c1d0-uuid-interno',
  userId: 'usr',
  status: 'received',
  items: [{ id: 'p', qty: 1, priceAtMoment: 1000 }],
  deliveryType: 'pickup',
  deliveryData: {},
  substitutionPreference: 'similar',
  customerName: 'Ana García',
  customerPhone: '573015550101',
  estimatedTotal: 1000,
  createdAt: '2026-10-06T12:00:00.000Z',
  ...overrides,
})

const Where = () => <p data-testid="where">{useLocation().pathname}</p>

const renderAlert = () => render(
  <MemoryRouter initialEntries={['/']}>
    <NewOrderAlert />
    <Routes><Route path="*" element={<Where />} /></Routes>
  </MemoryRouter>,
)

describe('NewOrderAlert', () => {
  beforeEach(() => { watcher.notify = null })

  it('muestra «Pedido #001248», nunca el identificador técnico, y abre el pedido por su ID interno', () => {
    renderAlert()
    act(() => watcher.notify?.(order({ reference: 1248 })))
    expect(screen.getByText('Pedido #001248')).toBeInTheDocument()
    expect(screen.queryByText(/uuid-interno/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Nuevo pedido/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/pedidos/f3b2c1d0-uuid-interno')
  })

  it('un pedido sin referencia (demo) no inventa un número', () => {
    renderAlert()
    act(() => watcher.notify?.(order()))
    expect(screen.getByText('Pedido')).toBeInTheDocument()
    expect(screen.queryByText(/#\d/)).not.toBeInTheDocument()
  })
})
