/**
 * @spec CU-2, CU-7, ADR-008, TASK-016 — Tests de OrdersListPage.
 * Fixture: 4 pedidos variados para cubrir AC-2..AC-6.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AdminOrder } from '@/types/adminOrder'

// ---------------------------------------------------------------------------
// Fixture de 4 pedidos
// ---------------------------------------------------------------------------

const fixture: AdminOrder[] = [
  {
    orderId: 'MAUI-001',
    userId: 'u1',
    status: 'received',
    items: [],
    deliveryType: 'pickup',
    deliveryData: {},
    substitutionPreference: 'similar',
    customerName: 'Juan García',
    customerPhone: '573015550101', // últimos 4: 0101
    estimatedTotal: 20000,
    createdAt: new Date().toISOString(),
  },
  {
    orderId: 'MAUI-002',
    userId: 'u2',
    status: 'confirmed',
    items: [],
    deliveryType: 'pickup',
    deliveryData: {},
    substitutionPreference: 'similar',
    customerName: 'María López',
    customerPhone: '573015551234', // últimos 4: 1234
    estimatedTotal: 35000,
    createdAt: new Date().toISOString(),
  },
  {
    orderId: 'MAUI-003',
    userId: 'u3',
    status: 'received',
    items: [],
    deliveryType: 'pickup',
    deliveryData: {},
    substitutionPreference: 'similar',
    customerName: 'Carlos Ruiz',
    customerPhone: undefined, // sin teléfono
    estimatedTotal: 15000,
    createdAt: new Date().toISOString(),
  },
  {
    orderId: 'MAUI-004',
    userId: 'u4',
    status: 'preparing',
    items: [],
    deliveryType: 'pickup',
    deliveryData: {},
    substitutionPreference: 'similar',
    customerName: 'Lucía Martínez',
    customerPhone: undefined, // sin teléfono
    estimatedTotal: 28000,
    createdAt: new Date().toISOString(),
  },
]

vi.mock('@/services', () => ({
  orderRepo: {
    list: vi.fn(),
  },
}))

let OrdersListPageComp: React.ComponentType

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.clearAllMocks()
  const { orderRepo } = await import('@/services')
  vi.mocked(orderRepo.list).mockResolvedValue(fixture)
  const mod = await import('../OrdersListPage')
  OrdersListPageComp = mod.OrdersListPage
})

afterEach(() => {
  vi.useRealTimers()
})

async function renderPage() {
  const result = render(
    <MemoryRouter>
      <OrdersListPageComp />
    </MemoryRouter>,
  )
  // Esperar carga inicial (la promesa del repo)
  await act(async () => {
    await Promise.resolve()
  })
  return result
}

async function typeSearch(value: string) {
  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value } })
  // Avanzar el debounce de 150ms
  await act(async () => {
    vi.advanceTimersByTime(200)
  })
}

describe('OrdersListPage', () => {
  it('muestra tabs del ciclo de pedidos con badge de conteo', async () => {
    await renderPage()

    expect(screen.getByRole('tab', { name: /Recibidos/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Confirmados/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Preparando/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Listos/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Entregados/i })).toBeInTheDocument()
  })

  it('estados comunes: tab «En camino» y cancelados canónicos con su contador', async () => {
    const { orderRepo } = await import('@/services')
    const base = fixture[0]!
    vi.mocked(orderRepo.list).mockResolvedValue([
      ...fixture,
      { ...base, orderId: 'MAUI-005', status: 'in_delivery', customerName: 'Pedro En Camino' },
      { ...base, orderId: 'MAUI-006', status: 'cancelled', customerName: 'Sara Cancelada' },
    ])
    await renderPage()

    const inDeliveryTab = screen.getByRole('tab', { name: /En camino/i })
    expect(inDeliveryTab).toHaveTextContent('1')
    expect(screen.getByRole('tab', { name: /Cancelados/i })).toHaveTextContent('1')
    // Un cancelado canónico no se cuenta en «Recibidos» (2 recibidos: MAUI-001 y MAUI-003).
    expect(screen.getByRole('tab', { name: /Recibidos/i })).toHaveTextContent('2')

    await act(async () => {
      fireEvent.click(inDeliveryTab)
    })
    expect(screen.getByRole('link', { name: /Pedido MAUI-005 de Pedro En Camino/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Pedido MAUI-006 de Sara Cancelada/ })).not.toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Cancelados/i }))
    })
    expect(screen.getByRole('link', { name: /Pedido MAUI-006 de Sara Cancelada/ })).toBeInTheDocument()
  })

  it('AC-2: búsqueda "0101" (4 dígitos) filtra por sufijo de teléfono', async () => {
    await renderPage()
    // Tab activo = received: Juan (0101) y Carlos (sin phone)
    await typeSearch('0101')

    expect(screen.getByText('Juan García · …0101')).toBeInTheDocument()
    // Carlos no tiene teléfono — no aparece
    expect(screen.queryByText(/Carlos Ruiz/)).not.toBeInTheDocument()
  })

  it('AC-3: búsqueda "juan" (no numérico) filtra por nombre case-insensitive', async () => {
    await renderPage()
    await typeSearch('juan')

    expect(screen.getByText('Juan García · …0101')).toBeInTheDocument()
    expect(screen.queryByText(/Carlos Ruiz/)).not.toBeInTheDocument()
  })

  it('AC-4: búsqueda "MAUI-001" filtra por orderId', async () => {
    await renderPage()
    await typeSearch('MAUI-001')

    expect(screen.getByText('Juan García · …0101')).toBeInTheDocument()
    expect(screen.queryByText(/Carlos Ruiz/)).not.toBeInTheDocument()
  })

  it('AC-5: fila sin customerPhone NO muestra " · …"', async () => {
    await renderPage()
    // Carlos Ruiz en tab received no tiene teléfono
    const carlosEl = screen.getByText('Carlos Ruiz')
    expect(carlosEl.textContent).not.toContain('…')
  })

  it('AC-6: fila con customerPhone muestra últimos 4 dígitos', async () => {
    await renderPage()
    // Juan García tiene phone '573015550101' → últimos 4: '0101'
    expect(screen.getByText('Juan García · …0101')).toBeInTheDocument()
  })
})
