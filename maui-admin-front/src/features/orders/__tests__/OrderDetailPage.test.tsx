/**
 * @spec §12, ADR-006, ADR-007, TASK-017 — Tests de OrderDetailPage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AdminOrder } from '@/types/adminOrder'
import type { Product } from '@/types/catalog'

// ---------------------------------------------------------------------------
// Mocks de repositorios
// ---------------------------------------------------------------------------

const mockOrder: AdminOrder = {
  orderId: 'MAUI-TEST',
  userId: 'user-1',
  status: 'preparing',
  items: [
    { id: 'prod-fixed', qty: 2, priceAtMoment: 5000 },
    {
      id: 'prod-variable',
      qty: 1,
      priceAtMoment: 15000,
      is_variable_weight: true,
      kilosRequested: 0.5,
    },
  ],
  deliveryType: 'pickup',
  deliveryData: {},
  substitutionPreference: 'similar',
  customerName: 'Ana García',
  customerPhone: '573015550101',
  estimatedTotal: 17500,
  createdAt: new Date().toISOString(),
}

const mockOrderNoPhone: AdminOrder = {
  ...mockOrder,
  orderId: 'MAUI-NOPHONE',
  customerPhone: undefined,
  items: [{ id: 'prod-fixed', qty: 1, priceAtMoment: 5000 }],
}

vi.mock('@/services', () => ({
  orderRepo: {
    getById: vi.fn(),
    updateStatus: vi.fn(),
    setRealWeights: vi.fn(),
    cancel: vi.fn(),
  },
  catalogRepo: {
    getProduct: vi.fn((id: string): Product | null => ({
      id,
      name: id === 'prod-fixed' ? 'Leche entera' : 'Queso campesino',
      price: 5000,
      unit: 'und',
      imageUrl: '',
      categoryId: 'lacteos',
      inStock: true,
      is_variable_weight: id === 'prod-variable',
    })),
  },
}))

vi.mock('@/auth/useSession', () => ({
  useSession: () => ({
    session: { user: { email: 'op@test.com', role: 'operator', merchantId: 'm1' } },
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('@/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

// ---------------------------------------------------------------------------
// Helper de render
// ---------------------------------------------------------------------------

function renderDetail(orderId: string) {
  return render(
    <MemoryRouter initialEntries={[`/pedidos/${orderId}`]}>
      <Routes>
        <Route path="/pedidos/:orderId" element={<OrderDetailPageLazy />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Importación diferida para que los mocks ya estén instalados
let OrderDetailPageLazy: React.ComponentType
beforeEach(async () => {
  const mod = await import('../OrderDetailPage')
  OrderDetailPageLazy = mod.OrderDetailPage
})

describe('OrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AC-1: resuelve nombres de productos desde catalogRepo', async () => {
    const { orderRepo } = await import('@/services')
    vi.mocked(orderRepo.getById).mockResolvedValue(mockOrder)

    renderDetail('MAUI-TEST')

    await waitFor(() => {
      expect(screen.getByText('Leche entera')).toBeInTheDocument()
      expect(screen.getByText('Queso campesino')).toBeInTheDocument()
    })
  })

  it('AC-2: WeightInput precargado con kilosRequested para items variables', async () => {
    const { orderRepo } = await import('@/services')
    vi.mocked(orderRepo.getById).mockResolvedValue(mockOrder)

    renderDetail('MAUI-TEST')

    await waitFor(() => {
      // El hint del WeightInput muestra el kilosRequested
      expect(screen.getByText(/Pedido: 0\.5 kg/)).toBeInTheDocument()
    })
  })

  it('AC-3: botón Marcar como listo disabled cuando no hay kilosReal', async () => {
    const { orderRepo } = await import('@/services')
    vi.mocked(orderRepo.getById).mockResolvedValue(mockOrder)

    renderDetail('MAUI-TEST')

    await waitFor(() => {
      const btn = screen.queryByText('Marcar como listo')
      if (btn) {
        expect(btn).toBeDisabled()
      }
    })
  })

  it('AC-9: pedido sin teléfono muestra hint y oculta CTAs de contacto', async () => {
    const { orderRepo } = await import('@/services')
    vi.mocked(orderRepo.getById).mockResolvedValue(mockOrderNoPhone)

    renderDetail('MAUI-NOPHONE')

    await waitFor(() => {
      expect(screen.getByText(/Sin teléfono en el pedido/i)).toBeInTheDocument()
      expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument()
      expect(screen.queryByText('Llamar')).not.toBeInTheDocument()
    })
  })

  it('AC-10: ningún CTA usa merchant.whatsapp', async () => {
    const { orderRepo } = await import('@/services')
    vi.mocked(orderRepo.getById).mockResolvedValue(mockOrder)

    const { container } = renderDetail('MAUI-TEST')
    await waitFor(() => screen.getByText('Ana García'))

    // merchant.whatsapp NO debe aparecer como href en ningún <a>
    const links = container.querySelectorAll('a[href*="wa.me"]')
    for (const link of links) {
      const href = link.getAttribute('href') ?? ''
      // Debe apuntar al teléfono del cliente (573015550101), no a un whatsapp del merchant
      expect(href).toContain('573015550101')
    }
  })
})
