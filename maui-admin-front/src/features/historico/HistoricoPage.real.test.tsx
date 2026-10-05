/**
 * Histórico y dashboard en modo real con fuentes simuladas (no es evidencia de cierre real):
 * rango/estado/búsqueda al servidor antes de paginar y día de la tienda en el dashboard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AdminOrder } from '@/types/adminOrder'
import { ApiError } from '@/services/http/apiError'

const mocks = vi.hoisted(() => ({ loadPage: vi.fn(), list: vi.fn() }))

vi.mock('@/services', () => ({
  isDemoMode: false,
  orderPages: { loadPage: mocks.loadPage },
  orderRepo: { list: mocks.list },
}))
vi.mock('@/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))
vi.mock('@/features/orders/useNewOrdersWatcher', () => ({ useNewOrdersWatcher: vi.fn() }))

vi.mock('@/auth/useSession', () => ({ useSession: () => ({ session: { user: { email: 'owner@test', merchantId: 'store' }, expiresAt: '2030-01-01' } }) }))

import { HistoricoPage } from './HistoricoPage'
import { DashboardPage } from '../dashboard/DashboardPage'

const order = (orderId: string, overrides: Partial<AdminOrder> = {}): AdminOrder => ({
  orderId,
  userId: 'usr-cli',
  status: 'delivered',
  version: 3,
  items: [{ id: 'prod-leche', name: 'Leche entera', qty: 1, priceAtMoment: 5000 }],
  deliveryType: 'pickup',
  deliveryData: {},
  substitutionPreference: 'similar',
  customerName: `Cliente ${orderId}`,
  estimatedTotal: 5000,
  createdAt: new Date().toISOString(),
  ...overrides,
})

describe('HistoricoPage (modo real, fuente simulada)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('carga el rango por defecto en el servidor y muestra el total final cuando existe', async () => {
    mocks.loadPage.mockResolvedValue({ items: [order('ord-1', { finalTotal: 7000 })], nextCursor: null })
    render(<MemoryRouter><HistoricoPage /></MemoryRouter>)
    expect(await screen.findByText('ord-1')).toBeInTheDocument()
    expect(screen.getByText(/7\.000/)).toBeInTheDocument()
    const [filter] = mocks.loadPage.mock.calls[0] as [{ from: string; to: string }]
    expect(filter.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('aplicar envía estado y búsqueda; teclear sin aplicar no consulta', async () => {
    mocks.loadPage.mockResolvedValue({ items: [], nextCursor: null })
    render(<MemoryRouter><HistoricoPage /></MemoryRouter>)
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'cancelled' } })
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: ' Ana ' } })
    expect(mocks.loadPage).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledTimes(2))
    expect(mocks.loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'cancelled', q: 'Ana' }), undefined, expect.anything())
  })

  it('un rango invertido marca los campos de fecha, no consulta y se recupera al corregirlo', async () => {
    mocks.loadPage.mockResolvedValue({ items: [], nextCursor: null })
    render(<MemoryRouter><HistoricoPage /></MemoryRouter>)
    await screen.findByText(/Sin pedidos|No hay pedidos/i)
    const calls = mocks.loadPage.mock.calls.length
    const from = screen.getByLabelText('Desde')
    const to = screen.getByLabelText('Hasta')
    fireEvent.change(from, { target: { value: '2026-10-10' } })
    fireEvent.change(to, { target: { value: '2026-10-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    for (const field of [from, to]) {
      expect(field).toHaveAttribute('aria-invalid', 'true')
      expect(field).toHaveAttribute('aria-describedby', 'hist-range-error')
    }
    expect(document.getElementById('hist-range-error')).toHaveTextContent('«Desde» no puede ser posterior a «Hasta»')
    expect(from).toHaveFocus()
    expect(mocks.loadPage).toHaveBeenCalledTimes(calls)

    fireEvent.change(to, { target: { value: '2026-10-12' } })
    expect(from).toHaveAttribute('aria-invalid', 'false')
    expect(to).toHaveAttribute('aria-invalid', 'false')
    expect(document.getElementById('hist-range-error')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledTimes(calls + 1))
    expect(mocks.loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-10-10', to: '2026-10-12' }), undefined, expect.anything())
  })

  it('pagina con «Cargar más» usando el cursor', async () => {
    mocks.loadPage.mockResolvedValueOnce({ items: [order('ord-1')], nextCursor: 'cur1' })
      .mockResolvedValueOnce({ items: [order('ord-2')], nextCursor: null })
    render(<MemoryRouter><HistoricoPage /></MemoryRouter>)
    await screen.findByText('ord-1')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(await screen.findByText('ord-2')).toBeInTheDocument()
    expect(mocks.loadPage).toHaveBeenLastCalledWith(expect.anything(), { cursor: 'cur1' }, expect.anything())
  })

  it('un fallo se muestra con reintento en vez de «sin pedidos»', async () => {
    mocks.loadPage.mockRejectedValueOnce(new ApiError({ kind: 'timeout', message: 'La solicitud tardó demasiado. Comprueba el estado antes de reintentar.' }))
    render(<MemoryRouter><HistoricoPage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('tardó demasiado')
    expect(screen.queryByText('Sin pedidos en el rango')).not.toBeInTheDocument()
  })
})

describe('DashboardPage (modo real, fuente simulada)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('pide solo el día de la tienda al servidor y cuenta por estado sin refiltrar en el navegador', async () => {
    const received = order('ord-r', { status: 'received', createdAt: new Date(Date.now() - 10 * 60_000).toISOString() })
    mocks.list.mockResolvedValue([received, order('ord-d', { finalTotal: 9000 })])
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(await screen.findByText('Dashboard del día')).toBeInTheDocument()
    const [filter] = mocks.list.mock.calls[0] as [{ from: string; to: string }]
    expect(filter.from).toBe(filter.to)
    expect(filter.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(screen.getByText(/9\.000/)).toBeInTheDocument()
    expect(screen.getByText('ord-r')).toBeInTheDocument()
  })

  it('un fallo se avisa y permite reintentar', async () => {
    mocks.list.mockRejectedValueOnce(new ApiError({ kind: 'unavailable', status: 503, message: 'El servicio no está disponible. Intenta más tarde.' }))
      .mockResolvedValueOnce([])
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
