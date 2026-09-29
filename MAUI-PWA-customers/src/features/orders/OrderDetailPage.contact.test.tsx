import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Order } from '../../types/orderService'
import { orderService } from '../../services/index'
import OrderDetailPage from './OrderDetailPage'

vi.mock('../../services/index', () => ({ orderService: { getById: vi.fn() } }))
vi.mock('./OrderTimeline', () => ({ default: () => <div>Estado del pedido</div> }))

const order: Order = {
  orderId: 'MAUI-123',
  userId: 'user-1',
  status: 'received',
  items: [{ id: 'queso', qty: 1, priceAtMoment: 15000 }],
  deliveryType: 'pickup',
  deliveryData: {},
  substitutionPreference: 'similar',
  customerName: 'Ana',
  estimatedTotal: 15000,
  createdAt: '2026-09-29T12:00:00.000Z',
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/pedidos/MAUI-123']}>
        <Routes>
          <Route path="/pedidos/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => window.localStorage.clear())

describe('contacto y total del pedido en la PWA', () => {
  it('oculta el enlace cuando WhatsApp conserva el número de ejemplo', async () => {
    window.localStorage.setItem('maui-admin-merchant', JSON.stringify({ mch_lechemiel: { whatsapp: '573000000000' } }))
    vi.mocked(orderService.getById).mockResolvedValue(order)
    renderPage()
    expect(await screen.findByText('WhatsApp pendiente de configurar')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Contactar a Leche y Miel/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Total estimado:/)).toBeInTheDocument()
  })

  it('abre WhatsApp configurado y muestra el total final', async () => {
    window.localStorage.setItem('maui-admin-merchant', JSON.stringify({ mch_lechemiel: { whatsapp: '3015550101' } }))
    vi.mocked(orderService.getById).mockResolvedValue({ ...order, finalTotal: 16500 })
    renderPage()
    const link = await screen.findByRole('link', { name: /Contactar a Leche y Miel/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/573015550101?text='))
    expect(screen.getByText(/Total final:/)).toBeInTheDocument()
  })
})
