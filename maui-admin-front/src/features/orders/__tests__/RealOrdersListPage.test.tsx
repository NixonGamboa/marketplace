/**
 * Lista de pedidos real con la fuente paginada simulada (no es evidencia de cierre real):
 * filtros enviados al servidor antes de paginar, cursor, errores y respuestas tardías.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AdminOrder } from '@/types/adminOrder'
import { ApiError } from '@/services/http/apiError'

vi.mock('@/auth/useSession', () => ({ useSession: () => ({ session: { user: { email: 'owner@test', merchantId: 'store' }, expiresAt: '2030-01-01' } }) }))

const loadPage = vi.hoisted(() => vi.fn())

vi.mock('@/services', () => ({ isDemoMode: false, orderPages: { loadPage } }))

import { RealOrdersListPage } from '../RealOrdersListPage'

const order = (orderId: string, overrides: Partial<AdminOrder> = {}): AdminOrder => ({
  orderId,
  userId: 'usr-cli',
  status: 'received',
  version: 1,
  items: [{ id: 'prod-leche', name: 'Leche entera', qty: 1, priceAtMoment: 5000 }],
  deliveryType: 'pickup',
  deliveryData: {},
  substitutionPreference: 'similar',
  customerName: `Cliente ${orderId}`,
  customerPhone: '573015550101',
  estimatedTotal: 5000,
  createdAt: '2026-10-02T15:00:00.000Z',
  ...overrides,
})

const renderPage = () => render(<MemoryRouter><RealOrdersListPage /></MemoryRouter>)

describe('RealOrdersListPage (fuente simulada)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('pide al servidor la pestaña activa y no muestra conteos locales', async () => {
    loadPage.mockResolvedValue({ items: [order('ord-1')], nextCursor: null })
    renderPage()
    expect(await screen.findByText(/Cliente ord-1/)).toBeInTheDocument()
    expect(loadPage).toHaveBeenCalledWith({ status: 'received' }, undefined, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(screen.queryByText('Cargar más')).not.toBeInTheDocument()
  })

  it('cambiar de pestaña filtra en el servidor y reinicia el cursor', async () => {
    loadPage.mockResolvedValueOnce({ items: [order('ord-1')], nextCursor: 'cur1' })
      .mockResolvedValueOnce({ items: [order('ord-2', { status: 'delivered' })], nextCursor: null })
    renderPage()
    await screen.findByText(/Cliente ord-1/)
    fireEvent.click(screen.getByRole('tab', { name: 'Entregados' }))
    expect(await screen.findByText(/Cliente ord-2/)).toBeInTheDocument()
    expect(screen.queryByText(/Cliente ord-1/)).not.toBeInTheDocument()
    expect(loadPage).toHaveBeenLastCalledWith({ status: 'delivered' }, undefined, expect.anything())
  })

  it('la búsqueda viaja como q al servidor (con debounce) y se vacía a quitar el texto', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      loadPage.mockResolvedValue({ items: [], nextCursor: null })
      renderPage()
      await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1))
      fireEvent.change(screen.getByLabelText('Buscar pedidos'), { target: { value: '  Ana  ' } })
      expect(loadPage).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(400) })
      await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2))
      expect(loadPage).toHaveBeenLastCalledWith({ status: 'received', q: 'Ana' }, undefined, expect.anything())
      expect(await screen.findByText('Sin resultados para "Ana"')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('«Cargar más» usa el cursor del servidor y añade la página sin duplicar la anterior', async () => {
    loadPage.mockResolvedValueOnce({ items: [order('ord-1')], nextCursor: 'cur1' })
      .mockResolvedValueOnce({ items: [order('ord-2')], nextCursor: null })
    renderPage()
    await screen.findByText(/Cliente ord-1/)
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(await screen.findByText(/Cliente ord-2/)).toBeInTheDocument()
    expect(screen.getByText(/Cliente ord-1/)).toBeInTheDocument()
    expect(loadPage).toHaveBeenLastCalledWith({ status: 'received' }, { cursor: 'cur1' }, expect.anything())
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
  })

  it('un fallo en «Cargar más» conserva lo cargado y permite reintentar', async () => {
    loadPage.mockResolvedValueOnce({ items: [order('ord-1')], nextCursor: 'cur1' })
      .mockRejectedValueOnce(new ApiError({ kind: 'unavailable', status: 503, message: 'El servicio no está disponible. Intenta más tarde.' }))
      .mockResolvedValueOnce({ items: [order('ord-2')], nextCursor: null })
    renderPage()
    await screen.findByText(/Cliente ord-1/)
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible')
    expect(screen.getByText(/Cliente ord-1/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(await screen.findByText(/Cliente ord-2/)).toBeInTheDocument()
  })

  it('el fallo de la primera página muestra el error y reintentar recarga', async () => {
    loadPage.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'No hay conexión con el servidor.' }))
      .mockResolvedValueOnce({ items: [order('ord-1')], nextCursor: null })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión con el servidor.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/Cliente ord-1/)).toBeInTheDocument()
  })

  it('descarta la respuesta tardía de un filtro anterior', async () => {
    let resolveFirst!: (page: { items: AdminOrder[]; nextCursor: null }) => void
    loadPage.mockReturnValueOnce(new Promise((done) => { resolveFirst = done }))
      .mockResolvedValueOnce({ items: [order('ord-nuevo', { status: 'ready' })], nextCursor: null })
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Listos' }))
    expect(await screen.findByText(/Cliente ord-nuevo/)).toBeInTheDocument()
    await act(async () => { resolveFirst({ items: [order('ord-viejo')], nextCursor: null }) })
    expect(screen.queryByText(/Cliente ord-viejo/)).not.toBeInTheDocument()
    expect(screen.getByText(/Cliente ord-nuevo/)).toBeInTheDocument()
  })
})
