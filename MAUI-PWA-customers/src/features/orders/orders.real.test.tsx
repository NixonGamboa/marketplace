/**
 * Historial y seguimiento reales con servicios simulados (no es evidencia de cierre real): filtros
 * al servidor, cursor, aislamiento por cuenta, sondeo con fallos y comprobante.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Order } from '@/types/orderService'
import { ApiError } from '@/services/http/apiError'
import { useAuthStore } from '@/stores/authStore'

const mocks = vi.hoisted(() => ({ listPage: vi.fn(), getById: vi.fn(), getStore: vi.fn() }))
vi.mock('@/services/realOrderService', () => ({ realOrderService: { listPage: mocks.listPage } }))
vi.mock('@/services/realCatalogService', () => ({ realCatalogService: { getStore: mocks.getStore, getCatalog: vi.fn() } }))
vi.mock('../../services/index', () => ({ orderService: { getById: mocks.getById } }))
vi.mock('./RealOrderReceipt', () => ({ RealOrderReceipt: ({ orderId }: { orderId: string }) => <p>comprobante {orderId}</p> }))
vi.mock('./OrderTimeline', () => ({ default: ({ currentStatus }: { currentStatus: string }) => <div><span>Estado del pedido</span><span>estado {currentStatus}</span></div> }))

import RealOrdersPage from './pages/RealOrdersPage'
import OrderDetailPage from './OrderDetailPage'

const order = (orderId: string, overrides: Partial<Order> = {}): Order => ({
  orderId,
  userId: 'usr-1',
  status: 'received',
  items: [{ id: 'queso', qty: 1, priceAtMoment: 15000 }],
  deliveryType: 'pickup',
  deliveryData: {},
  substitutionPreference: 'similar',
  customerName: 'Ana',
  estimatedTotal: 15000,
  createdAt: new Date().toISOString(),
  ...overrides,
})

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getStore.mockResolvedValue({ contactPhone: '573105550101' })
  useAuthStore.setState({ user: { id: 'usr-1', name: 'Ana', phone: '573105550101', isAuthenticated: true }, isAuthenticated: true, sessionStatus: 'ready' })
})
afterEach(() => { cleanup(); useAuthStore.setState({ user: null, isAuthenticated: false }) })

describe('RealOrdersPage (servicio simulado)', () => {
  const renderPage = (qc = client()) => render(
    <QueryClientProvider client={qc}><MemoryRouter><RealOrdersPage /></MemoryRouter></QueryClientProvider>,
  )

  it('pide la primera página al servidor con el tamaño de página y sin filtros', async () => {
    mocks.listPage.mockResolvedValue({ items: [order('ord-1')], nextCursor: null })
    renderPage()
    expect(await screen.findByText('Pedido ord-1')).toBeInTheDocument()
    expect(mocks.listPage).toHaveBeenCalledWith({ limit: 20 }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull()
  })

  it('aplicar filtros envía q/status/from/to al servidor y reinicia el cursor; teclear no consulta', async () => {
    mocks.listPage.mockResolvedValue({ items: [], nextCursor: null })
    renderPage()
    await waitFor(() => expect(mocks.listPage).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Buscar pedidos'), { target: { value: ' ord-7 ' } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'delivered' } })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } })
    expect(mocks.listPage).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(mocks.listPage).toHaveBeenCalledTimes(2))
    expect(mocks.listPage).toHaveBeenLastCalledWith(
      { q: 'ord-7', status: 'delivered', from: '2026-09-01', to: '2026-09-30', limit: 20 },
      expect.anything(),
    )
    expect(await screen.findByText('No encontramos pedidos con esos filtros')).toBeInTheDocument()
  })

  it('un rango invertido se rechaza en el formulario sin consultar', async () => {
    mocks.listPage.mockResolvedValue({ items: [], nextCursor: null })
    renderPage()
    await waitFor(() => expect(mocks.listPage).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('no puede ser posterior')
    expect(mocks.listPage).toHaveBeenCalledTimes(1)
  })

  it('«Cargar más» usa el cursor del servidor y conserva los filtros aplicados', async () => {
    mocks.listPage
      .mockResolvedValueOnce({ items: [order('ord-1')], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ items: [order('ord-2')], nextCursor: null })
    renderPage()
    await screen.findByText('Pedido ord-1')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(await screen.findByText('Pedido ord-2')).toBeInTheDocument()
    expect(screen.getByText('Pedido ord-1')).toBeInTheDocument()
    expect(mocks.listPage).toHaveBeenLastCalledWith({ limit: 20, cursor: 'cursor-1' }, expect.anything())
  })

  it('un fallo muestra el mensaje y reintentar recarga; no se vuelve «aún no has hecho pedidos»', async () => {
    mocks.listPage
      .mockRejectedValueOnce(new ApiError({ kind: 'unavailable', status: 503, message: 'El servicio no está disponible. Intenta más tarde.' }))
      .mockResolvedValueOnce({ items: [order('ord-1')], nextCursor: null })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible')
    expect(screen.queryByText('Aún no has hecho pedidos')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Pedido ord-1')).toBeInTheDocument()
  })

  it('la caché es por cuenta: otra persona nunca ve los pedidos de la anterior', async () => {
    const qc = client()
    mocks.listPage.mockResolvedValueOnce({ items: [order('ord-de-ana')], nextCursor: null })
    const first = renderPage(qc)
    await screen.findByText('Pedido ord-de-ana')
    first.unmount()

    useAuthStore.setState({ user: { id: 'usr-2', name: 'Beto', phone: '573105550102', isAuthenticated: true } })
    mocks.listPage.mockResolvedValueOnce({ items: [order('ord-de-beto', { userId: 'usr-2' })], nextCursor: null })
    renderPage(qc)
    expect(await screen.findByText('Pedido ord-de-beto')).toBeInTheDocument()
    expect(screen.queryByText('Pedido ord-de-ana')).toBeNull()
  })
})

describe('OrderDetailPage real (servicio simulado)', () => {
  const renderDetail = (qc = client()) => render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/pedidos/ord-1']}>
        <Routes><Route path="/pedidos/:orderId" element={<OrderDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  describe('aviso de procesamiento (PM-03)', () => {
    const scheduled = { kind: 'scheduled', reason: 'after_closing', startsAt: '2026-10-06T13:00:00.000Z' } as const
    const unscheduled = { kind: 'unscheduled', reason: 'override_closed' } as const

    it('recogida con franja: muestra la fecha fijada por el servidor, aparte del aviso, sin «esta mañana»', async () => {
      mocks.getById.mockResolvedValue(order('ord-1', { deliveryData: { timeSlot: 'morning' }, timeSlotDate: '2026-10-07', processingNotice: scheduled }))
      renderDetail()
      expect(await screen.findByText('Franja de recogida: por la mañana · miércoles, 7 de octubre')).toBeInTheDocument()
      expect(screen.getByText(/Comenzaremos a procesarlo el martes, 6 de octubre/)).toBeInTheDocument()
      expect(screen.queryByText(/esta mañana|esta tarde/i)).toBeNull()
    })

    it('recogida con franja sin fecha registrada (pedido anterior): solo la franja', async () => {
      mocks.getById.mockResolvedValue(order('ord-1', { deliveryData: { timeSlot: 'afternoon' } }))
      renderDetail()
      expect(await screen.findByText('Franja de recogida: por la tarde')).toBeInTheDocument()
    })

    it('pedido recibido fuera de atención: muestra el aviso persistido con la próxima apertura', async () => {
      mocks.getById.mockResolvedValue(order('ord-1', { processingNotice: scheduled }))
      renderDetail()
      const notice = await screen.findByText(/¡Recibimos tu pedido!/)
      expect(notice).toHaveTextContent('Comenzaremos a procesarlo el martes, 6 de octubre a las 8:00 a. m.')
      expect(notice).not.toHaveTextContent(/entreg|recog/i)
      expect(notice.closest('[role="status"]')).not.toBeNull()
    })

    it('cierre sin reapertura conocida: aviso sin hora inventada', async () => {
      mocks.getById.mockResolvedValue(order('ord-1', { processingNotice: unscheduled }))
      renderDetail()
      const notice = await screen.findByText(/¡Recibimos tu pedido!/)
      expect(notice).toHaveTextContent('Lo procesaremos cuando retomemos la atención.')
      expect(notice).not.toHaveTextContent(/\d:\d\d/)
    })

    it('sin aviso (recibido atendiendo) o con el pedido ya en proceso no se muestra', async () => {
      mocks.getById.mockResolvedValue(order('ord-1'))
      const first = renderDetail()
      expect(await screen.findByText(/estado received/)).toBeInTheDocument()
      expect(screen.queryByText(/¡Recibimos tu pedido!/)).toBeNull()
      first.unmount()
      mocks.getById.mockResolvedValue(order('ord-1', { status: 'confirmed', processingNotice: scheduled }))
      renderDetail()
      expect(await screen.findByText(/estado confirmed/)).toBeInTheDocument()
      expect(screen.queryByText(/¡Recibimos tu pedido!/)).toBeNull()
    })
  })

  it('el contacto sale del servidor, no del almacenamiento local', async () => {
    window.localStorage.setItem('maui-admin-merchant', JSON.stringify({ mch_lechemiel: { whatsapp: '3009998888' } }))
    mocks.getById.mockResolvedValue(order('ord-1'))
    renderDetail()
    const link = await screen.findByRole('link', { name: /Contactar a Leche y Miel/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/573105550101?text='))
    window.localStorage.clear()
  })

  it('sin contacto configurado oculta el enlace sin romper el seguimiento', async () => {
    mocks.getStore.mockResolvedValue({ contactPhone: null })
    mocks.getById.mockResolvedValue(order('ord-1'))
    renderDetail()
    expect(await screen.findByText('WhatsApp pendiente de configurar')).toBeInTheDocument()
    expect(screen.getByText('Estado del pedido')).toBeInTheDocument()
  })

  it('un pedido ajeno o inexistente (404) no ofrece reintento', async () => {
    mocks.getById.mockRejectedValue(new ApiError({ kind: 'not_found', status: 404, message: 'x' }))
    renderDetail()
    expect(await screen.findByText('No encontramos un pedido con ese identificador.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('un fallo de red sin datos ofrece reintentar', async () => {
    mocks.getById.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'x' })).mockResolvedValueOnce(order('ord-1'))
    renderDetail()
    expect(await screen.findByText(/No pudimos cargar tu pedido/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Estado del pedido')).toBeInTheDocument()
  })

  it('un fallo del sondeo con el pedido ya cargado no lo tapa: avisa y conserva el estado', async () => {
    const qc = client()
    mocks.getById.mockResolvedValueOnce(order('ord-1')).mockRejectedValue(new ApiError({ kind: 'network', message: 'x' }))
    renderDetail(qc)
    await screen.findByText('Estado del pedido')
    await qc.refetchQueries({ queryKey: ['order', 'usr-1', null, 'ord-1'] })
    expect(await screen.findByText(/No pudimos actualizar el estado/)).toBeInTheDocument()
    expect(screen.getByText('Estado del pedido')).toBeInTheDocument()
  })

  it('el comprobante real se abre bajo demanda con el ID del pedido', async () => {
    mocks.getById.mockResolvedValue(order('ord-1'))
    renderDetail()
    await screen.findByText('Estado del pedido')
    expect(screen.queryByText('comprobante ord-1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }))
    expect(await screen.findByText('comprobante ord-1')).toBeInTheDocument()
  })
  it('pausa offline, reconcilia al volver y refleja cancelación y total final', async () => {
    mocks.getById.mockResolvedValueOnce(order('ord-1', { version: 1 }))
      .mockResolvedValue(order('ord-1', { version: 2, status: 'cancelled', finalTotal: 18000 }))
    renderDetail()
    await screen.findByText('Estado del pedido')
    vi.useFakeTimers()
    try {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      fireEvent(window, new Event('offline'))
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(mocks.getById).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/Actualización pausada/)).toBeInTheDocument()
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
      fireEvent(window, new Event('online'))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(screen.getByText('estado cancelled')).toBeInTheDocument()
      expect(screen.getByText(/Total final:/)).toBeInTheDocument()
      expect(screen.queryByText(/Actualización pausada/)).toBeNull()
    } finally { vi.useRealTimers(); vi.restoreAllMocks() }
  })

})
