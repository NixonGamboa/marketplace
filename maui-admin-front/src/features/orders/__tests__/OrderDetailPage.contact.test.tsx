import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AdminOrder } from '@/types/adminOrder'
import { OrderDetailPage } from '../OrderDetailPage'
import { orderRepo } from '@/services'

vi.mock('@/services', () => ({
  orderRepo: { getById: vi.fn(), updateStatus: vi.fn(), setRealWeights: vi.fn(), cancel: vi.fn() },
  catalogRepo: { getProduct: vi.fn(async () => null) },
}))
vi.mock('@/auth/useSession', () => ({
  useSession: () => ({ session: { user: { email: 'operador@ejemplo.com' } } }),
}))
vi.mock('@/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const baseOrder: AdminOrder = {
  orderId: 'MAUI-123',
  userId: 'user-1',
  status: 'received',
  items: [{ id: 'queso', qty: 1, priceAtMoment: 15000 }],
  deliveryType: 'delivery',
  deliveryData: { address: 'Casa azul, esquina', lat: 3.915, lng: -74.667 },
  substitutionPreference: 'call_me',
  customerName: 'Ana',
  estimatedTotal: 15000,
  createdAt: '2026-09-29T12:00:00.000Z',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/pedidos/MAUI-123']}>
      <Routes>
        <Route path="/pedidos/:orderId" element={<OrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('detalle de entrega y total', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra referencia y ubicación válida; conserva total estimado en pedidos anteriores', async () => {
    vi.mocked(orderRepo.getById).mockResolvedValue(baseOrder)
    renderPage()
    await waitFor(() => expect(screen.getByText('Dirección o referencia: Casa azul, esquina')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Abrir ubicación en Google Maps' }))
      .toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=3.915,-74.667')
    expect(screen.getByText(/Total estimado:/)).toBeInTheDocument()
  })

  it('muestra total final después del pesaje y oculta coordenadas inválidas', async () => {
    vi.mocked(orderRepo.getById).mockResolvedValue({
      ...baseOrder,
      finalTotal: 16500,
      deliveryData: { lat: 999, lng: -74.667 },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText(/Total final:/)).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Abrir ubicación en Google Maps' })).not.toBeInTheDocument()
  })
})
