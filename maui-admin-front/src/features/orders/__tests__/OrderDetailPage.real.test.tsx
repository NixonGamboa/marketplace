/**
 * Detalle de pedido en modo real con repositories simulados (no es evidencia de cierre contra
 * API/Postgres): versión en cada mutación, conflictos 409, errores de carga y reglas por estado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AdminOrder } from '@/types/adminOrder'
import { ApiError } from '@/services/http/apiError'

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  updateStatus: vi.fn(),
  setRealWeights: vi.fn(),
  cancel: vi.fn(),
  getProduct: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toast: {} as { success: unknown; error: unknown; info: unknown },
}))
// El efecto de carga depende de `toast`: el mock debe devolver siempre el mismo objeto.
mocks.toast = { success: mocks.toastSuccess, error: mocks.toastError, info: vi.fn() }

vi.mock('@/services', () => ({
  isDemoMode: false,
  orderRepo: { getById: mocks.getById, updateStatus: mocks.updateStatus, setRealWeights: mocks.setRealWeights, cancel: mocks.cancel },
  catalogRepo: { getProduct: mocks.getProduct, listProducts: vi.fn(async () => []) },
  serverOrderRepo: { changeItems: vi.fn() },
}))
vi.mock('@/auth/useSession', () => ({
  useSession: () => ({ session: { user: { email: 'operador@maui.test' } } }),
}))
vi.mock('@/ui/Toast', () => ({
  useToast: () => mocks.toast,
}))
vi.mock('@/components/orders/RealOrderReceipt', () => ({
  RealOrderReceipt: ({ orderId }: { orderId: string }) => <p>Comprobante de {orderId}</p>,
}))

import { OrderDetailPage } from '../OrderDetailPage'

const order = (overrides: Partial<AdminOrder> = {}): AdminOrder => ({
  orderId: 'ord-1',
  userId: 'usr-cli',
  status: 'preparing',
  version: 4,
  items: [
    { id: 'prod-leche', name: 'Leche entera', qty: 2, priceAtMoment: 5000, unit: '1 L' },
    { id: 'prod-queso', name: 'Queso campesino', qty: 1, priceAtMoment: 20000, is_variable_weight: true, kilosRequested: 0.5, unit: 'kg' },
  ],
  deliveryType: 'pickup',
  deliveryData: {},
  substitutionPreference: 'similar',
  customerName: 'Ana García',
  customerPhone: '573015550101',
  estimatedTotal: 20000,
  createdAt: '2026-10-02T15:00:00.000Z',
  ...overrides,
})

const [milk, cheese] = order().items
const milkOnly = (overrides: Partial<AdminOrder> = {}) => order({ items: [milk], ...overrides })

const renderPage = () => render(
  <MemoryRouter initialEntries={['/pedidos/ord-1']}>
    <Routes><Route path="/pedidos/:orderId" element={<OrderDetailPage />} /></Routes>
  </MemoryRouter>,
)

const setWeight = (value: string) => {
  const input = screen.getByLabelText('Peso real')
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

describe('OrderDetailPage (modo real, repositories simulados)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('muestra al personal la franja de recogida con la fecha fijada por el servidor, sin confundirla con la apertura', async () => {
    mocks.getById.mockResolvedValue(order({ status: 'received', deliveryData: { timeSlot: 'morning' }, timeSlotDate: '2026-10-07' }))
    renderPage()
    expect(await screen.findByText('Franja de recogida: por la mañana · miércoles, 7 de octubre')).toBeInTheDocument()
    expect(screen.queryByText(/hoy|esta mañana/i)).toBeNull()
  })

  it('pedido sin fecha de franja (anterior o cierre manual): solo la franja, sin inventar fecha', async () => {
    mocks.getById.mockResolvedValue(order({ status: 'received', deliveryData: { timeSlot: 'afternoon' } }))
    renderPage()
    expect(await screen.findByText('Franja de recogida: por la tarde')).toBeInTheDocument()
  })

  it('usa el nombre del pedido y no consulta el catálogo cuando ya viene en el snapshot', async () => {
    mocks.getById.mockResolvedValue(order())
    renderPage()
    expect(await screen.findByRole('heading', { name: 'ord-1' })).toBeInTheDocument()
    expect(mocks.getProduct).not.toHaveBeenCalled()
  })

  it('guarda solo el peso cambiado con la versión leída y avanza con la versión devuelta', async () => {
    mocks.getById.mockResolvedValue(order())
    mocks.setRealWeights.mockResolvedValue(order({ version: 5, items: [milk, { ...cheese, kilosReal: 0.6 }] }))
    mocks.updateStatus.mockResolvedValue(order({ status: 'ready', version: 6, finalTotal: 22000 }))
    renderPage()
    await screen.findByRole('heading', { name: 'ord-1' })
    expect(screen.getByRole('button', { name: 'Marcar como listo' })).toBeDisabled()
    setWeight('0.6')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Marcar como listo' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como listo' }))
    await waitFor(() => expect(mocks.updateStatus).toHaveBeenCalled())
    expect(mocks.setRealWeights).toHaveBeenCalledWith('ord-1', [{ itemId: 'prod-queso', kilos: 0.6 }], 'operador@maui.test', 4)
    expect(mocks.updateStatus).toHaveBeenCalledWith('ord-1', 'ready', 'operador@maui.test', 5)
    expect(mocks.setRealWeights.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateStatus.mock.invocationCallOrder[0])
  })

  it('no reenvía pesos ya guardados al avanzar', async () => {
    const weighed = order({ items: [milk, { ...cheese, kilosReal: 0.6 }] })
    mocks.getById.mockResolvedValue(weighed)
    mocks.updateStatus.mockResolvedValue({ ...weighed, status: 'ready', version: 5 })
    renderPage()
    await screen.findByRole('heading', { name: 'ord-1' })
    // Los pesos del servidor se sincronizan antes de mostrar el formulario.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Marcar como listo' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como listo' }))
    await waitFor(() => expect(mocks.updateStatus).toHaveBeenCalledWith('ord-1', 'ready', 'operador@maui.test', 4))
    expect(mocks.setRealWeights).not.toHaveBeenCalled()
  })

  it('ante un 409 informa y recarga el pedido vigente', async () => {
    mocks.getById.mockResolvedValueOnce(milkOnly({ status: 'received' }))
      .mockResolvedValueOnce(milkOnly({ status: 'confirmed', version: 5 }))
    mocks.updateStatus.mockRejectedValue(new ApiError({ kind: 'conflict', status: 409, message: 'El pedido cambió. Recarga e intenta de nuevo.' }))
    renderPage()
    await screen.findByRole('heading', { name: 'ord-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('El pedido cambió. Recarga e intenta de nuevo.'))
    await waitFor(() => expect(mocks.getById).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Marcar como preparando' })).toBeInTheDocument()
  })

  it('cancela con motivo y la versión leída; un 409 recarga', async () => {
    mocks.getById.mockResolvedValue(milkOnly({ status: 'received' }))
    mocks.cancel.mockRejectedValueOnce(new ApiError({ kind: 'conflict', status: 409, message: 'cambió' }))
    renderPage()
    await screen.findByRole('heading', { name: 'ord-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: 'Sin stock' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith('ord-1', 'Sin stock', 'operador@maui.test', 4))
    await waitFor(() => expect(mocks.getById).toHaveBeenCalledTimes(2))
  })

  it('un domicilio listo ofrece «en camino» además de entregar', async () => {
    const delivery = { status: 'ready' as const, deliveryType: 'delivery' as const, deliveryData: { address: 'Calle 1' } }
    mocks.getById.mockResolvedValue(milkOnly(delivery))
    mocks.updateStatus.mockResolvedValue(milkOnly({ ...delivery, status: 'in_delivery', version: 5 }))
    renderPage()
    await screen.findByRole('heading', { name: 'ord-1' })
    expect(screen.getByRole('button', { name: 'Marcar como entregado' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar en camino' }))
    await waitFor(() => expect(mocks.updateStatus).toHaveBeenCalledWith('ord-1', 'in_delivery', 'operador@maui.test', 4))
  })

  it('en recogida listo no hay «en camino», los pesos quedan bloqueados y no hay cambios de ítems', async () => {
    mocks.getById.mockResolvedValue(order({ status: 'ready', items: [milk, { ...cheese, kilosReal: 0.6 }] }))
    renderPage()
    await screen.findByRole('heading', { name: 'ord-1' })
    expect(screen.queryByRole('button', { name: 'Marcar en camino' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Peso real')).toBeDisabled()
    expect(screen.queryByText('Cambios de ítems')).not.toBeInTheDocument()
  })

  it('en preparación muestra el panel de cambios de ítems y la pestaña de comprobante real', async () => {
    mocks.getById.mockResolvedValue(order())
    renderPage()
    await screen.findByRole('heading', { name: 'ord-1' })
    expect(screen.getByText('Cambios de ítems')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Comprobante' }))
    expect(await screen.findByText('Comprobante de ord-1')).toBeInTheDocument()
  })

  it('distingue un fallo recuperable (reintentar) de un pedido inexistente', async () => {
    mocks.getById.mockRejectedValueOnce(new ApiError({ kind: 'unavailable', status: 503, message: 'El servicio no está disponible. Intenta más tarde.' }))
      .mockResolvedValueOnce(order())
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'ord-1' })).toBeInTheDocument()
  })

  it('un 404 se informa como pedido no encontrado sin ofrecer reintento', async () => {
    mocks.getById.mockRejectedValue(new ApiError({ kind: 'not_found', status: 404, message: 'El recurso ya no está disponible.' }))
    renderPage()
    expect(await screen.findByText('Pedido no encontrado.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('guarda pesos sin avanzar y lista lo quitado o sustituido respecto al original', async () => {
    const changed = order({
      originalItems: [milk, cheese, { id: 'prod-pan', name: 'Pan', qty: 1, priceAtMoment: 3000 }],
      items: [milk, cheese, { id: 'prod-arepa', name: 'Arepas', qty: 1, priceAtMoment: 3500, substitutedFor: 'prod-pan' }],
    })
    mocks.getById.mockResolvedValue(changed)
    mocks.setRealWeights.mockResolvedValue({ ...changed, version: 5 })
    renderPage()
    await screen.findByRole('heading', { name: 'ord-1' })
    expect(screen.getByText(/Quitado o sustituido respecto al pedido original: Pan/)).toBeInTheDocument()
    setWeight('0.55')
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar pesos' }))
    await waitFor(() => expect(mocks.setRealWeights).toHaveBeenCalledWith('ord-1', [{ itemId: 'prod-queso', kilos: 0.55 }], 'operador@maui.test', 4))
    expect(mocks.updateStatus).not.toHaveBeenCalled()
  })
})
