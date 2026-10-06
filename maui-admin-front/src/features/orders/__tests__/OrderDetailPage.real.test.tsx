/**
 * Detalle de pedido en modo real contra un servidor simulado en memoria con las reglas del contrato
 * (no es evidencia de cierre contra API/Postgres): vista por estado, confirmaciones, lista de preparación con
 * guardado automático, conflictos 409, reabrir y referencia comercial (ME-03/ME-04).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { OrderItemChange, OrderItemDto } from '@shared/contracts'
import type { OrderStatus } from '@/types/orderService'
import type { AdminOrder } from '@/types/adminOrder'
import type { Product } from '@/types/catalog'
import { ApiError } from '@/services/http/apiError'
import { createFakeOrderServer, type FakeOrderServer } from './fakeOrderServer'

const mocks = vi.hoisted(() => ({
  server: null as unknown as FakeOrderServer,
  role: 'operator' as string | null,
  products: [] as Product[],
  getProduct: vi.fn(),
  copy: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toast: {} as { success: unknown; error: unknown; info: unknown },
}))
// El efecto de carga depende de `toast`: el mock debe devolver siempre el mismo objeto.
mocks.toast = { success: mocks.toastSuccess, error: mocks.toastError, info: vi.fn() }

vi.mock('@/services', () => ({
  isDemoMode: false,
  orderRepo: {
    getById: (orderId: string) => mocks.server.repo.getById(orderId),
    updateStatus: (orderId: string, next: OrderStatus, by: string, version?: number) => mocks.server.repo.updateStatus(orderId, next, by, version),
    changeItems: (orderId: string, changes: OrderItemChange[], version?: number) => mocks.server.repo.changeItems(orderId, changes, version),
    cancel: (orderId: string, reason: string, by: string, version?: number) => mocks.server.repo.cancel(orderId, reason, by, version),
    setRealWeights: vi.fn(),
  },
  catalogRepo: { getProduct: (...args: unknown[]) => mocks.getProduct(...args), listProducts: async () => mocks.products },
}))
vi.mock('@/auth/useSession', () => ({
  useSession: () => ({ session: mocks.role ? { user: { email: 'operador@maui.test', role: mocks.role } } : null }),
}))
vi.mock('@/ui/Toast', () => ({ useToast: () => mocks.toast }))
vi.mock('@/lib/clipboard', () => ({ copyToClipboard: (...args: unknown[]) => mocks.copy(...args) }))
vi.mock('@/components/orders/RealOrderReceipt', () => ({
  RealOrderReceipt: ({ orderId }: { orderId: string }) => <p>Comprobante de {orderId}</p>,
}))

import { OrderDetailPage } from '../OrderDetailPage'

const order = (overrides: Partial<AdminOrder> = {}): AdminOrder => ({
  orderId: 'ord-1',
  userId: 'usr-cli',
  status: 'preparing',
  version: 4,
  reference: 1248,
  paymentMethod: 'qr',
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

const [milk, cheese] = order().items as [OrderItemDto, OrderItemDto]
const rice = { id: 'prod-arroz', name: 'Arroz', qty: 1, priceAtMoment: 4000, unit: '500 g' }
const pickedMilk = { ...milk, picked: true as const }
const weighedCheese = { ...cheese, kilosReal: 0.6, picked: true as const }

const serve = (o: AdminOrder): FakeOrderServer => {
  mocks.server = createFakeOrderServer(o)
  return mocks.server
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/pedidos/ord-1']}>
    <Routes><Route path="/pedidos/:orderId" element={<OrderDetailPage />} /></Routes>
  </MemoryRouter>,
)

const loaded = async () => { await screen.findByRole('heading', { name: 'Pedido #001248' }) }
const checkbox = (name: string) => screen.getByRole('checkbox', { name })
const weightField = (name: string) => screen.getByLabelText(`Peso real de ${name}`) as HTMLInputElement
const primary = (name: string) => screen.getByRole('button', { name })
const typeWeight = (name: string, value: string) => {
  const input = weightField(name)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}
const dialogs = () => screen.queryAllByRole('dialog')

describe('OrderDetailPage (modo real, servidor simulado)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'operator'
    mocks.products = []
    mocks.getProduct.mockResolvedValue(null)
    mocks.copy.mockResolvedValue(true)
  })
  afterEach(() => { cleanup() })

  describe('referencia y datos visibles (ME-04)', () => {
    it('muestra «Pedido #001248» sin ningún identificador técnico y enlaza WhatsApp con la misma referencia', async () => {
      serve(order({ status: 'received' }))
      renderPage()
      await loaded()
      expect(screen.queryByText(/ord-1/)).not.toBeInTheDocument()
      expect(screen.getByLabelText('Detalle del pedido Pedido #001248')).toBeInTheDocument()
      const href = screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href') ?? ''
      expect(href).toContain('wa.me/573015550101')
      expect(decodeURIComponent(href)).toContain('Pedido #001248: lo recibimos.')
      expect(decodeURIComponent(href)).not.toContain('ord-1')
    })

    it('el picking imprime y copia con la referencia, no con el identificador', async () => {
      serve(order())
      renderPage()
      await loaded()
      fireEvent.click(screen.getByRole('tab', { name: 'Lista de picking' }))
      expect(screen.getByText(/^Pedido #001248 ·/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Copiar como texto' }))
      await waitFor(() => expect(mocks.copy).toHaveBeenCalled())
      const copied = mocks.copy.mock.calls[0]![0] as string
      expect(copied).toContain('Pedido #001248')
      expect(copied).not.toContain('ord-1')
    })

    it('un producto sin nombre en el pedido se resuelve por catálogo y, si no, como «Producto», nunca con su ID', async () => {
      serve(order({ status: 'confirmed', items: [{ id: 'prod-uuid-1', qty: 1, priceAtMoment: 3000 }, { id: 'prod-uuid-2', qty: 1, priceAtMoment: 4000 }] }))
      mocks.getProduct.mockImplementation(async (id: string) => (id === 'prod-uuid-1' ? { id, name: 'Pan tajado' } : null))
      renderPage()
      await loaded()
      expect(await screen.findByText('Pan tajado')).toBeInTheDocument()
      expect(screen.getByText('Producto')).toBeInTheDocument()
      expect(screen.queryByText(/prod-uuid/)).not.toBeInTheDocument()
    })

    it('usa el nombre del pedido y no consulta el catálogo cuando ya viene en el snapshot', async () => {
      serve(order())
      renderPage()
      await loaded()
      expect(mocks.getProduct).not.toHaveBeenCalled()
    })

    it('muestra el método de pago elegido, sin «pagado» ni datos de cobro', async () => {
      serve(order({ status: 'ready', items: [pickedMilk, weighedCheese] }))
      renderPage()
      await loaded()
      expect(screen.getByText('Pago: Código QR')).toBeInTheDocument()
      expect(screen.queryByText(/pagado|pago seguro|llave/i)).not.toBeInTheDocument()
    })

    it('un pedido anterior sin método de pago aparece como Efectivo', async () => {
      const { paymentMethod: _method, ...legacy } = order({ status: 'confirmed' })
      mocks.server = createFakeOrderServer(legacy)
      renderPage()
      await loaded()
      expect(screen.getByText('Pago: Efectivo')).toBeInTheDocument()
    })

    it('muestra al personal la franja de recogida con la fecha fijada por el servidor, sin confundirla con la apertura', async () => {
      serve(order({ status: 'confirmed', deliveryData: { timeSlot: 'morning' }, timeSlotDate: '2026-10-07' }))
      renderPage()
      expect(await screen.findByText('Franja de recogida: por la mañana · miércoles, 7 de octubre')).toBeInTheDocument()
      expect(screen.queryByText(/hoy|esta mañana/i)).toBeNull()
    })

    it('pedido sin fecha de franja (anterior o cierre manual): solo la franja, sin inventar fecha', async () => {
      serve(order({ status: 'confirmed', deliveryData: { timeSlot: 'afternoon' } }))
      renderPage()
      expect(await screen.findByText('Franja de recogida: por la tarde')).toBeInTheDocument()
    })
  })

  describe('vista por estado', () => {
    it('Recibido muestra antigüedad, fuera de horario, modalidad, número de productos, preferencia y pago', async () => {
      serve(order({
        status: 'received', paymentMethod: undefined, substitutionPreference: 'call_me',
        processingNotice: { kind: 'unscheduled', reason: 'after_closing' },
      }))
      renderPage()
      await loaded()
      expect(screen.getByText(/^Hace /)).toBeInTheDocument()
      expect(screen.getByText('Llegó fuera de horario')).toBeInTheDocument()
      expect(screen.getByText('Retiro en tienda')).toBeInTheDocument()
      expect(screen.getByText('2 productos')).toBeInTheDocument()
      expect(screen.getByText('Si falta un producto: Llamarlo antes de cambiar nada')).toBeInTheDocument()
      expect(screen.getByText('Pago: Efectivo')).toBeInTheDocument()
    })

    it('Confirmado muestra los productos con las cantidades y pesos pedidos', async () => {
      serve(order({ status: 'confirmed' }))
      renderPage()
      await loaded()
      expect(screen.getByText('Leche entera')).toBeInTheDocument()
      expect(screen.getByText('Pedido: 0,5 kg')).toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('Listo a domicilio: total final, pago, dirección y mapa; primaria «Salió a domicilio» y secundaria de entrega directa', async () => {
      serve(order({
        status: 'ready', deliveryType: 'delivery', deliveryData: { address: 'Calle 1 # 2-3', lat: 4.6, lng: -74.1 },
        items: [pickedMilk, weighedCheese], finalTotal: 22000,
      }))
      renderPage()
      await loaded()
      expect(screen.getByText('Total final: $ 22.000')).toBeInTheDocument()
      expect(screen.getByText('Dirección o referencia: Calle 1 # 2-3')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Abrir ubicación en Google Maps' })).toBeInTheDocument()
      expect(primary('Salió a domicilio')).toBeEnabled()
      expect(primary('Entrega directa')).toBeEnabled()
    })

    it('Listo en recogida: primaria «Cliente recogió», sin «En camino» y con la franja', async () => {
      serve(order({ status: 'ready', items: [pickedMilk, weighedCheese], finalTotal: 22000, deliveryData: { timeSlot: 'afternoon' } }))
      renderPage()
      await loaded()
      expect(primary('Cliente recogió')).toBeEnabled()
      expect(screen.queryByRole('button', { name: /Salió a domicilio|camino/i })).not.toBeInTheDocument()
      expect(screen.getByText('Franja de recogida: por la tarde')).toBeInTheDocument()
    })

    it('Entregado se abre en el comprobante, solo lectura: sin acciones, sin cancelar ni reabrir', async () => {
      serve(order({ status: 'delivered', items: [pickedMilk, weighedCheese], finalTotal: 22000 }))
      renderPage()
      await loaded()
      expect(screen.getByRole('tab', { name: 'Comprobante' })).toHaveAttribute('aria-selected', 'true')
      expect(await screen.findByText('Comprobante de ord-1')).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Acciones del pedido' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Cancelar pedido|Reabrir|Confirmar|Marcar/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    it('Cancelado muestra motivo y hora, y se abre en el comprobante sin controles', async () => {
      serve(order({ status: 'cancelled', cancellationReason: 'Sin stock de leche', cancelledAt: '2026-10-03T10:00:00.000Z' }))
      renderPage()
      await loaded()
      expect(screen.getByText('Pedido cancelado')).toBeInTheDocument()
      expect(screen.getByText('Motivo: Sin stock de leche')).toBeInTheDocument()
      expect(screen.getByText(/^Cancelado: /)).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Comprobante' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByRole('button', { name: /Cancelar pedido|Reabrir|Confirmar|Marcar/ })).not.toBeInTheDocument()
    })

    it('En camino ofrece «Confirmar entrega» y no se puede cancelar', async () => {
      serve(order({ status: 'in_delivery', deliveryType: 'delivery', deliveryData: { address: 'Calle 1' }, items: [pickedMilk, weighedCheese], finalTotal: 22000 }))
      renderPage()
      await loaded()
      expect(primary('Confirmar entrega')).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Reabrir/ })).not.toBeInTheDocument()
    })

    it('la actualización automática no cambia la pestaña elegida', async () => {
      const server = serve(order({ status: 'received' }))
      renderPage()
      await loaded()
      fireEvent.click(screen.getByRole('tab', { name: 'Lista de picking' }))
      server.repo.updateStatus.mockRejectedValueOnce(new ApiError({ kind: 'conflict', status: 409, message: 'El pedido cambió.' }))
      fireEvent.click(primary('Confirmar pedido'))
      await waitFor(() => expect(server.repo.getById).toHaveBeenCalledTimes(2))
      expect(screen.getByRole('tab', { name: 'Lista de picking' })).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('confirmaciones: exactamente las necesarias', () => {
    it('Confirmar pedido y Comenzar preparación aplican con un toque, sin diálogo', async () => {
      const server = serve(order({ status: 'received' }))
      renderPage()
      await loaded()
      fireEvent.click(primary('Confirmar pedido'))
      await waitFor(() => expect(server.repo.updateStatus).toHaveBeenCalledWith('ord-1', 'confirmed', 'operador@maui.test', 4))
      expect(dialogs()).toHaveLength(0)
      fireEvent.click(await screen.findByRole('button', { name: 'Comenzar preparación' }))
      await waitFor(() => expect(server.repo.updateStatus).toHaveBeenCalledWith('ord-1', 'preparing', 'operador@maui.test', 5))
      expect(dialogs()).toHaveLength(0)
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Pedido confirmado')
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Preparación iniciada')
    })

    it('un doble toque envía la transición una sola vez', async () => {
      const server = serve(order({ status: 'received' }))
      renderPage()
      await loaded()
      const button = primary('Confirmar pedido')
      fireEvent.click(button)
      fireEvent.click(button)
      await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
      expect(server.repo.updateStatus).toHaveBeenCalledTimes(1)
    })

    it.each<[string, Partial<AdminOrder>, OrderStatus, string]>([
      ['Marcar como listo', { status: 'preparing', items: [pickedMilk, weighedCheese] }, 'ready', 'Pedido listo'],
      ['Cliente recogió', { status: 'ready', items: [pickedMilk, weighedCheese], finalTotal: 22000 }, 'delivered', 'Pedido entregado'],
      ['Entrega directa', { status: 'ready', deliveryType: 'delivery', deliveryData: { address: 'Calle 1' }, items: [pickedMilk, weighedCheese], finalTotal: 22000 }, 'delivered', 'Pedido entregado'],
      ['Confirmar entrega', { status: 'in_delivery', deliveryType: 'delivery', deliveryData: { address: 'Calle 1' }, items: [pickedMilk, weighedCheese], finalTotal: 22000 }, 'delivered', 'Pedido entregado'],
    ])('«%s» abre exactamente una confirmación y la aplica una vez', async (label, overrides, target, toastText) => {
      const server = serve(order(overrides))
      renderPage()
      await loaded()
      fireEvent.click(primary(label))
      expect(dialogs()).toHaveLength(1)
      expect(server.repo.updateStatus).not.toHaveBeenCalled()
      fireEvent.click(within(dialogs()[0]!).getByRole('button', { name: 'Confirmar' }))
      await waitFor(() => expect(server.repo.updateStatus).toHaveBeenCalledTimes(1))
      expect(server.repo.updateStatus.mock.calls[0]![1]).toBe(target)
      await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(toastText))
      expect(dialogs()).toHaveLength(0)
    })

    it('«Salió a domicilio» no cierra nada y se aplica con un toque', async () => {
      const server = serve(order({ status: 'ready', deliveryType: 'delivery', deliveryData: { address: 'Calle 1' }, items: [pickedMilk, weighedCheese], finalTotal: 22000 }))
      renderPage()
      await loaded()
      fireEvent.click(primary('Salió a domicilio'))
      await waitFor(() => expect(server.repo.updateStatus).toHaveBeenCalledWith('ord-1', 'in_delivery', 'operador@maui.test', 4))
      expect(dialogs()).toHaveLength(0)
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Salió a domicilio')
    })

    it('volver en la confirmación no cambia el estado', async () => {
      const server = serve(order({ status: 'preparing', items: [pickedMilk, weighedCheese] }))
      renderPage()
      await loaded()
      fireEvent.click(primary('Marcar como listo'))
      fireEvent.click(within(dialogs()[0]!).getByRole('button', { name: 'Volver' }))
      expect(dialogs()).toHaveLength(0)
      expect(server.repo.updateStatus).not.toHaveBeenCalled()
    })

    it('los avisos usan etiquetas en español, nunca el código del estado', async () => {
      serve(order({ status: 'received' }))
      renderPage()
      await loaded()
      fireEvent.click(primary('Confirmar pedido'))
      await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
      for (const [message] of mocks.toastSuccess.mock.calls) expect(message).not.toMatch(/confirmed|preparing|ready|in_delivery|delivered/)
    })

    it('un 409 al cambiar de estado avisa y relee el pedido vigente', async () => {
      const server = serve(order({ status: 'received' }))
      renderPage()
      await loaded()
      server.byAnotherOperator([])
      fireEvent.click(primary('Confirmar pedido'))
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('El pedido cambió. Recarga e intenta de nuevo.'))
      await waitFor(() => expect(server.repo.getById).toHaveBeenCalledTimes(2))
      fireEvent.click(await screen.findByRole('button', { name: 'Confirmar pedido' }))
      await waitFor(() => expect(server.repo.updateStatus).toHaveBeenLastCalledWith('ord-1', 'confirmed', 'operador@maui.test', 5))
    })
  })

  describe('cancelar', () => {
    it('vive en una zona separada del pie, con el motivo visible al abrirla y la versión leída', async () => {
      const server = serve(order({ status: 'received' }))
      renderPage()
      await loaded()
      expect(within(screen.getByRole('group', { name: 'Acciones del pedido' })).queryByText('Cancelar pedido')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
      const confirm = screen.getByRole('button', { name: 'Confirmar cancelación' })
      expect(confirm).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Motivo de cancelación (mín. 5 caracteres)'), { target: { value: 'Sin stock' } })
      fireEvent.click(confirm)
      await waitFor(() => expect(server.repo.cancel).toHaveBeenCalledWith('ord-1', 'Sin stock', 'operador@maui.test', 4))
      expect(await screen.findByText('Pedido cancelado')).toBeInTheDocument()
    })

    it('un 409 al cancelar recarga el pedido', async () => {
      const server = serve(order({ status: 'received' }))
      renderPage()
      await loaded()
      server.byAnotherOperator([])
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
      fireEvent.change(screen.getByLabelText('Motivo de cancelación (mín. 5 caracteres)'), { target: { value: 'Sin stock' } })
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
      await waitFor(() => expect(server.repo.getById).toHaveBeenCalledTimes(2))
    })
  })

  describe('carga', () => {
    it('distingue un fallo recuperable (reintentar) de un pedido inexistente', async () => {
      const server = serve(order())
      server.repo.getById.mockRejectedValueOnce(new ApiError({ kind: 'unavailable', status: 503, message: 'El servicio no está disponible. Intenta más tarde.' }))
      renderPage()
      expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible')
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      await loaded()
    })

    it('un 404 se informa como pedido no encontrado sin ofrecer reintento', async () => {
      const server = serve(order())
      server.repo.getById.mockRejectedValue(new ApiError({ kind: 'not_found', status: 404, message: 'El recurso ya no está disponible.' }))
      renderPage()
      expect(await screen.findByText('Pedido no encontrado.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
    })
  })

  describe('lista de preparación', () => {
    it('es una sola lista con casilla, cantidad o peso pedido y avance', async () => {
      serve(order())
      renderPage()
      await loaded()
      expect(screen.getAllByRole('checkbox')).toHaveLength(2)
      expect(screen.getByText('0 de 2 alistados')).toBeInTheDocument()
      expect(screen.getByText('Pedido: 0,5 kg · $ 20.000/kg')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Guardar pesos' })).not.toBeInTheDocument()
      expect(screen.queryByText('Cambios de ítems')).not.toBeInTheDocument()
    })

    it('tocar la fila marca solo cuando el servidor confirma y el avance se recupera al recargar', async () => {
      const server = serve(order())
      const hold = server.holdNextChange()
      renderPage()
      await loaded()
      fireEvent.click(checkbox('Leche entera'))
      expect(await screen.findByText('Guardando…')).toBeInTheDocument()
      expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'false')
      hold.release()
      await waitFor(() => expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'true'))
      expect(server.repo.changeItems).toHaveBeenCalledWith('ord-1', [{ type: 'pick', itemId: 'prod-leche', picked: true }], 4)
      expect(screen.getByText('1 de 2 alistados')).toBeInTheDocument()

      cleanup()
      renderPage()
      await loaded()
      expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByText('1 de 2 alistados')).toBeInTheDocument()
    })

    it('tocar de nuevo desmarca para corregir un error', async () => {
      const server = serve(order({ items: [pickedMilk, cheese] }))
      renderPage()
      await loaded()
      fireEvent.click(checkbox('Leche entera'))
      await waitFor(() => expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'false'))
      expect(server.repo.changeItems).toHaveBeenCalledWith('ord-1', [{ type: 'pick', itemId: 'prod-leche', picked: false }], 4)
    })

    it('un peso válido al salir del campo se guarda, marca el producto y muestra el subtotal', async () => {
      const server = serve(order())
      renderPage()
      await loaded()
      typeWeight('Queso campesino', '0,6')
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'true'))
      expect(server.repo.changeItems).toHaveBeenCalledWith('ord-1', [{ type: 'weight', itemId: 'prod-queso', kilosReal: 0.6 }], 4)
      expect(screen.getByText(/Subtotal: \$ 12\.000/)).toBeInTheDocument()
      expect(weightField('Queso campesino').value).toBe('0.6')
    })

    it('borrar el peso lo desmarca; desmarcar la fila conserva el peso escrito', async () => {
      const server = serve(order({ items: [milk, weighedCheese] }))
      renderPage()
      await loaded()
      fireEvent.click(checkbox('Queso campesino'))
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'false'))
      expect(weightField('Queso campesino').value).toBe('0.6')
      expect(server.current().items[1]).toMatchObject({ kilosReal: 0.6 })
      expect(server.current().items[1]!.picked).toBeUndefined()

      fireEvent.click(checkbox('Queso campesino'))
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'true'))

      typeWeight('Queso campesino', '')
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'false'))
      expect(server.repo.changeItems).toHaveBeenLastCalledWith('ord-1', [{ type: 'weight', itemId: 'prod-queso', kilosReal: null }], expect.any(Number))
      expect(server.current().items[1]!.kilosReal).toBeUndefined()
    })

    it('un peso variable sin peso no se marca al tocar: lleva al campo y no llama al servidor', async () => {
      const server = serve(order())
      renderPage()
      await loaded()
      fireEvent.click(checkbox('Queso campesino'))
      expect(weightField('Queso campesino')).toHaveFocus()
      expect(server.repo.changeItems).not.toHaveBeenCalled()
    })

    it('un peso inválido se explica en la fila y no se envía', async () => {
      const server = serve(order())
      renderPage()
      await loaded()
      typeWeight('Queso campesino', '0')
      expect(await screen.findByText(/Ingresa un peso entre 0.001 y 100 kg/)).toBeInTheDocument()
      expect(weightField('Queso campesino')).toHaveAttribute('aria-invalid', 'true')
      expect(server.repo.changeItems).not.toHaveBeenCalled()
      expect(primary('Marcar como listo')).toBeDisabled()
    })

    it('si falla el guardado la fila no queda marcada, conserva lo escrito, ofrece Reintentar y bloquea Listo', async () => {
      const server = serve(order({ items: [pickedMilk, cheese] }))
      server.failNextChange(new ApiError({ kind: 'network', message: 'No hay conexión con el servidor.' }))
      renderPage()
      await loaded()
      typeWeight('Queso campesino', '0.6')
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('No se guardó')
      expect(alert).toHaveTextContent('No hay conexión con el servidor.')
      expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'false')
      expect(weightField('Queso campesino').value).toBe('0.6')
      expect(primary('Marcar como listo')).toBeDisabled()
      expect(screen.getByText('Faltan 1: Queso campesino')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'true'))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(primary('Marcar como listo')).toBeEnabled()
    })

    it('un fallo al marcar no marca la fila y Reintentar la marca', async () => {
      const server = serve(order({ items: [milk, weighedCheese] }))
      server.failNextChange(new ApiError({ kind: 'unavailable', status: 503, message: 'El servicio no está disponible. Intenta más tarde.' }))
      renderPage()
      await loaded()
      fireEvent.click(checkbox('Leche entera'))
      expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible')
      expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'false')
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      await waitFor(() => expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'true'))
    })

    it('al editar de nuevo un peso con error, lo escrito reemplaza el cambio fallido', async () => {
      const server = serve(order())
      server.failNextChange(new ApiError({ kind: 'network', message: 'No hay conexión con el servidor.' }))
      renderPage()
      await loaded()
      typeWeight('Queso campesino', '0.6')
      await screen.findByRole('alert')
      typeWeight('Queso campesino', '0.7')
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'true'))
      expect(server.current().items[1]).toMatchObject({ kilosReal: 0.7 })
    })
  })

  describe('Listo bloqueado por pendientes', () => {
    it('muestra los nombres de lo que falta, lleva a la fila y se habilita con todo alistado y guardado', async () => {
      const server = serve(order())
      renderPage()
      await loaded()
      const listo = primary('Marcar como listo')
      expect(listo).toBeDisabled()
      expect(listo).not.toHaveAttribute('title')
      const notice = screen.getByRole('button', { name: 'Faltan 2: Leche entera, Queso campesino' })
      fireEvent.click(notice)
      expect(checkbox('Leche entera')).toHaveFocus()

      fireEvent.click(checkbox('Leche entera'))
      const second = await screen.findByRole('button', { name: 'Faltan 1: Queso campesino' })
      fireEvent.click(second)
      expect(weightField('Queso campesino')).toHaveFocus()

      typeWeight('Queso campesino', '0.6')
      await waitFor(() => expect(primary('Marcar como listo')).toBeEnabled())
      expect(screen.queryByText(/^Faltan/)).not.toBeInTheDocument()
      expect(server.repo.updateStatus).not.toHaveBeenCalled()
    })

    it('mientras algo se está guardando no se puede avanzar', async () => {
      const server = serve(order({ items: [pickedMilk, { ...rice }] }))
      const hold = server.holdNextChange()
      renderPage()
      await loaded()
      fireEvent.click(checkbox('Arroz'))
      await screen.findByText('Guardando…')
      expect(primary('Marcar como listo')).toBeDisabled()
      expect(screen.getByText('Faltan 1: Arroz')).toBeInTheDocument()
      hold.release()
      await waitFor(() => expect(primary('Marcar como listo')).toBeEnabled())
    })

    it('un peso escrito pero sin salir del campo todavía bloquea', async () => {
      serve(order({ items: [pickedMilk, cheese] }))
      renderPage()
      await loaded()
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.6' } })
      expect(primary('Marcar como listo')).toBeDisabled()
    })

    it('«Marcar como listo» pide una sola confirmación con el total final y avisa que se cierran los ajustes', async () => {
      const server = serve(order({ items: [milk, cheese] }))
      renderPage()
      await loaded()
      fireEvent.click(checkbox('Leche entera'))
      await waitFor(() => expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'true'))
      typeWeight('Queso campesino', '0.6')
      await waitFor(() => expect(primary('Marcar como listo')).toBeEnabled())
      fireEvent.click(primary('Marcar como listo'))
      expect(dialogs()).toHaveLength(1)
      const dialog = within(dialogs()[0]!)
      expect(dialog.getByText(/Total final: \$ 22\.000/)).toBeInTheDocument()
      expect(dialog.getByText(/se cierran los productos y los pesos/)).toBeInTheDocument()
      fireEvent.click(dialog.getByRole('button', { name: 'Confirmar' }))
      await waitFor(() => expect(server.repo.updateStatus).toHaveBeenCalledWith('ord-1', 'ready', 'operador@maui.test', 6))
      expect(await screen.findByRole('button', { name: 'Reabrir preparación' })).toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })
  })

  describe('concurrencia entre operadores', () => {
    it('si otra persona marcó OTRO producto, relee y reaplica el cambio sin perderlo ni mostrar error', async () => {
      const server = serve(order({ items: [milk, rice, cheese] }))
      renderPage()
      await loaded()
      server.byAnotherOperator({ type: 'pick', itemId: 'prod-arroz', picked: true })

      fireEvent.click(checkbox('Leche entera'))
      await waitFor(() => expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'true'))
      expect(server.repo.changeItems.mock.calls.map((call) => call[2])).toEqual([4, 5])
      expect(server.repo.getById).toHaveBeenCalledTimes(2)
      expect(checkbox('Arroz')).toHaveAttribute('aria-checked', 'true')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(server.current().items.filter((item) => item.picked)).toHaveLength(2)
    })

    it('si otra persona pesó el MISMO producto, detecta el conflicto, no sobrescribe y conserva lo escrito', async () => {
      const server = serve(order())
      renderPage()
      await loaded()
      server.byAnotherOperator({ type: 'weight', itemId: 'prod-queso', kilosReal: 0.8 })

      typeWeight('Queso campesino', '0.6')
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Este producto lo cambió otra persona')
      expect(server.repo.changeItems).toHaveBeenCalledTimes(1)
      expect(server.current().items[1]).toMatchObject({ kilosReal: 0.8 })
      expect(weightField('Queso campesino').value).toBe('0.6')
      expect(primary('Marcar como listo')).toBeDisabled()

      // La persona revisó lo ajeno y decide guardar lo suyo: se hace de forma explícita.
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      await waitFor(() => expect(server.current().items[1]).toMatchObject({ kilosReal: 0.6 }))
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    })

    it('si otra persona ya dejó el mismo producto como se pretendía, no escribe de más', async () => {
      const server = serve(order({ items: [milk, weighedCheese] }))
      renderPage()
      await loaded()
      server.byAnotherOperator({ type: 'pick', itemId: 'prod-leche', picked: true })
      fireEvent.click(checkbox('Leche entera'))
      await waitFor(() => expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'true'))
      expect(server.repo.changeItems).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('si otra persona cambió la estructura del pedido, avisa y no escribe', async () => {
      const server = serve(order({ substitutionPreference: 'remove', items: [milk, rice, weighedCheese] }))
      renderPage()
      await loaded()
      server.byAnotherOperator({ type: 'remove', itemId: 'prod-arroz' })

      fireEvent.click(checkbox('Leche entera'))
      expect(await screen.findByRole('alert')).toHaveTextContent('Otra persona cambió los productos del pedido')
      expect(server.repo.changeItems).toHaveBeenCalledTimes(1)
      expect(server.current().items.find((item) => item.id === 'prod-leche')!.picked).toBeUndefined()
      expect(screen.queryByRole('checkbox', { name: 'Arroz' })).not.toBeInTheDocument()
    })

    it('si el pedido salió de preparación mientras tanto, no escribe y explica el estado', async () => {
      const server = serve(order({ items: [milk, weighedCheese] }))
      renderPage()
      await loaded()
      server.byAnotherOperator({ type: 'pick', itemId: 'prod-leche', picked: true })
      await server.repo.updateStatus('ord-1', 'ready', 'otro', 5)
      server.repo.changeItems.mockClear()
      fireEvent.click(checkbox('Leche entera'))
      expect(await screen.findByRole('alert')).toHaveTextContent('El pedido ya no está en preparación')
      expect(server.repo.changeItems).toHaveBeenCalledTimes(1)
    })

    it('dos guardados seguidos de productos distintos se serializan con la versión de la respuesta anterior', async () => {
      const server = serve(order({ items: [milk, rice, weighedCheese] }))
      renderPage()
      await loaded()
      fireEvent.click(checkbox('Leche entera'))
      fireEvent.click(checkbox('Arroz'))
      await waitFor(() => expect(checkbox('Arroz')).toHaveAttribute('aria-checked', 'true'))
      expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'true')
      expect(server.repo.changeItems.mock.calls.map((call) => call[2])).toEqual([4, 5])
      expect(server.repo.getById).toHaveBeenCalledTimes(1)
    })
  })

  describe('faltantes, sustitución y retiro', () => {
    const arepas: Product = { id: 'prod-arepa', name: 'Arepas', price: 3500, unit: '5 u', imageUrl: '', categoryId: 'c', inStock: true, is_variable_weight: false }

    it('«Falta» abre el diálogo de la fila; contactar al cliente solo no resuelve el faltante', async () => {
      const server = serve(order({ substitutionPreference: 'call_me' }))
      mocks.products = [arepas]
      renderPage()
      await loaded()
      fireEvent.click(screen.getByRole('button', { name: 'Falta Leche entera' }))
      const dialog = within(dialogs()[0]!)
      expect(dialog.getByText('El cliente pidió que lo llames antes de cambiar nada. Aplica solo lo que él decida.')).toBeInTheDocument()
      const whatsapp = dialog.getByRole('link', { name: 'Escribir por WhatsApp' })
      expect(decodeURIComponent(whatsapp.getAttribute('href') ?? '')).toContain('Pedido #001248: no tenemos Leche entera')
      expect(dialog.getByRole('link', { name: 'Llamar' })).toHaveAttribute('href', 'tel:573015550101')

      fireEvent.click(dialog.getByRole('button', { name: 'Aplicar cambio' }))
      expect(await dialog.findByText('Confirma que hablaste con el cliente antes de cambiar el pedido.')).toBeInTheDocument()
      fireEvent.click(dialog.getByLabelText(/Hablé con el cliente/))
      fireEvent.click(dialog.getByRole('button', { name: 'Aplicar cambio' }))
      expect(await dialog.findByText('Elige el producto sustituto.')).toBeInTheDocument()
      expect(server.repo.changeItems).not.toHaveBeenCalled()
      fireEvent.click(dialog.getByRole('button', { name: 'Volver' }))
      expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByText('Faltan 2: Leche entera, Queso campesino')).toBeInTheDocument()
    })

    it('retirar un producto lo deja tachado, fuera del conteo y sin bloquear Listo', async () => {
      const server = serve(order({ substitutionPreference: 'call_me', items: [milk, weighedCheese] }))
      renderPage()
      await loaded()
      fireEvent.click(screen.getByRole('button', { name: 'Falta Leche entera' }))
      const dialog = within(dialogs()[0]!)
      fireEvent.click(dialog.getByLabelText('Quitar del pedido'))
      fireEvent.click(dialog.getByLabelText(/Hablé con el cliente/))
      fireEvent.click(dialog.getByRole('button', { name: 'Aplicar cambio' }))
      await waitFor(() => expect(server.repo.changeItems).toHaveBeenCalledWith(
        'ord-1', [{ type: 'remove', itemId: 'prod-leche', customerContacted: true }], 4,
      ))
      await waitFor(() => expect(dialogs()).toHaveLength(0))
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Producto quitado')
      expect(screen.queryByRole('checkbox', { name: 'Leche entera' })).not.toBeInTheDocument()
      expect(screen.getByText('Leche entera').closest('li')).toHaveTextContent('Retirado: no se empaca ni se cobra')
      expect(screen.getByText('1 de 1 alistados')).toBeInTheDocument()
      expect(primary('Marcar como listo')).toBeEnabled()
    })

    it('el sustituto entra como fila nueva sin marcar y el original queda tachado «Sustituido por»', async () => {
      const server = serve(order({ items: [pickedMilk, weighedCheese] }))
      mocks.products = [arepas]
      renderPage()
      await loaded()
      expect(screen.getByText('2 de 2 alistados')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Falta Leche entera' }))
      const dialog = within(dialogs()[0]!)
      fireEvent.change(await dialog.findByLabelText('Producto sustituto'), { target: { value: 'prod-arepa' } })
      fireEvent.change(dialog.getByLabelText('Cantidad'), { target: { value: '2' } })
      fireEvent.click(dialog.getByRole('button', { name: 'Aplicar cambio' }))
      await waitFor(() => expect(server.repo.changeItems).toHaveBeenCalledWith(
        'ord-1', [{ type: 'substitute', itemId: 'prod-leche', productId: 'prod-arepa', qty: 2 }], 4,
      ))
      expect(await screen.findByRole('checkbox', { name: 'Sustituto prod-arepa' })).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByText('1 de 2 alistados')).toBeInTheDocument()
      expect(screen.getByText('Leche entera').closest('li')).toHaveTextContent('Sustituido por Sustituto prod-arepa')
      expect(primary('Marcar como listo')).toBeDisabled()
      expect(screen.getByText('Faltan 1: Sustituto prod-arepa')).toBeInTheDocument()
    })

    it('si preguntaron por el producto y otra persona lo cambió, el diálogo queda abierto con lo elegido y el aviso', async () => {
      const server = serve(order({ items: [milk, weighedCheese] }))
      mocks.products = [arepas]
      renderPage()
      await loaded()
      fireEvent.click(screen.getByRole('button', { name: 'Falta Leche entera' }))
      const dialog = within(dialogs()[0]!)
      fireEvent.change(await dialog.findByLabelText('Producto sustituto'), { target: { value: 'prod-arepa' } })
      server.byAnotherOperator({ type: 'pick', itemId: 'prod-leche', picked: true })
      fireEvent.click(dialog.getByRole('button', { name: 'Aplicar cambio' }))
      expect(await dialog.findByRole('alert')).toHaveTextContent('Este producto lo cambió otra persona')
      expect((dialog.getByLabelText('Producto sustituto') as HTMLSelectElement).value).toBe('prod-arepa')
      expect(server.current().items[0]).toMatchObject({ id: 'prod-leche', picked: true })
    })

    it('con preferencia «quitar» no ofrece sustituir', async () => {
      serve(order({ substitutionPreference: 'remove' }))
      renderPage()
      await loaded()
      fireEvent.click(screen.getByRole('button', { name: 'Falta Leche entera' }))
      const dialog = within(dialogs()[0]!)
      expect(dialog.getByLabelText('Sustituir por otro producto')).toBeDisabled()
      expect(dialog.getByLabelText('Quitar del pedido')).toBeChecked()
    })
  })

  describe('reabrir preparación', () => {
    const ready = () => order({ status: 'ready', version: 7, items: [pickedMilk, weighedCheese], finalTotal: 22000 })

    it('devuelve Listo a Preparando con la versión leída y conserva marcas, pesos y total', async () => {
      const server = serve(ready())
      renderPage()
      await loaded()
      fireEvent.click(screen.getByRole('button', { name: 'Reabrir preparación' }))
      await waitFor(() => expect(server.repo.updateStatus).toHaveBeenCalledWith('ord-1', 'preparing', 'operador@maui.test', 7))
      expect(dialogs()).toHaveLength(0)
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Preparación reabierta')
      expect(await screen.findByRole('checkbox', { name: 'Leche entera' })).toHaveAttribute('aria-checked', 'true')
      expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'true')
      expect(weightField('Queso campesino').value).toBe('0.6')
      expect(screen.getByText('2 de 2 alistados')).toBeInTheDocument()
      expect(screen.getByText('Total final: $ 22.000')).toBeInTheDocument()
      expect(server.current().finalTotal).toBe(22000)
      expect(primary('Marcar como listo')).toBeEnabled()
    })

    it('es una acción secundaria: la principal sigue siendo la del estado', async () => {
      serve(ready())
      renderPage()
      await loaded()
      expect(primary('Cliente recogió')).toBeEnabled()
      expect(primary('Reabrir preparación')).toBeEnabled()
    })

    it('solo para personal autorizado', async () => {
      mocks.role = null
      serve(ready())
      renderPage()
      await loaded()
      expect(screen.queryByRole('button', { name: 'Reabrir preparación' })).not.toBeInTheDocument()
    })

    it.each(['received', 'confirmed', 'preparing', 'in_delivery', 'delivered', 'cancelled'] as const)('no se ofrece en %s', async (status) => {
      serve(order({
        status, deliveryType: 'delivery', deliveryData: { address: 'Calle 1' }, items: [pickedMilk, weighedCheese], finalTotal: 22000,
        ...(status === 'cancelled' ? { cancellationReason: 'Sin stock', cancelledAt: '2026-10-03T10:00:00.000Z' } : {}),
      }))
      renderPage()
      await loaded()
      expect(screen.queryByRole('button', { name: 'Reabrir preparación' })).not.toBeInTheDocument()
    })

    it('un 409 al reabrir avisa y relee en vez de reabrir sobre datos viejos', async () => {
      const server = serve(ready())
      renderPage()
      await loaded()
      server.byAnotherOperator([])
      await waitFor(() => undefined)
      fireEvent.click(screen.getByRole('button', { name: 'Reabrir preparación' }))
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
      await waitFor(() => expect(server.repo.getById).toHaveBeenCalledTimes(2))
      expect(server.current().status).toBe('ready')
    })
  })

  describe('borrador de peso frente al sondeo', () => {
    /** El sondeo se reanuda al volver el foco: trae lo que otra persona haya hecho. */
    const poll = async (reads: number) => {
      await act(async () => { window.dispatchEvent(new Event('focus')) })
      await waitFor(() => expect(mocks.server.repo.getById).toHaveBeenCalledTimes(reads))
    }

    it('si el sondeo trae un peso ajeno del MISMO producto antes de salir del campo, hay conflicto, no hay PATCH y el texto se conserva', async () => {
      const server = serve(order())
      renderPage()
      await loaded()
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.6' } })
      server.byAnotherOperator({ type: 'weight', itemId: 'prod-queso', kilosReal: 0.8 })
      await poll(2)
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'true'))
      expect(weightField('Queso campesino').value).toBe('0.6')

      fireEvent.blur(weightField('Queso campesino'))
      expect(await screen.findByRole('alert')).toHaveTextContent('Este producto lo cambió otra persona')
      expect(server.repo.changeItems).not.toHaveBeenCalled()
      expect(server.current().items[1]).toMatchObject({ kilosReal: 0.8 })
      expect(weightField('Queso campesino').value).toBe('0.6')
      expect(primary('Marcar como listo')).toBeDisabled()
    })

    it('editar otra vez tras el conflicto no lo adopta: solo «Reintentar» toma el pedido actual como base y conserva la intención', async () => {
      const server = serve(order())
      renderPage()
      await loaded()
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.6' } })
      server.byAnotherOperator({ type: 'weight', itemId: 'prod-queso', kilosReal: 0.8 })
      await poll(2)
      fireEvent.blur(weightField('Queso campesino'))
      await screen.findByRole('alert')

      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.65' } })
      fireEvent.blur(weightField('Queso campesino'))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Este producto lo cambió otra persona'))
      expect(server.repo.changeItems).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      await waitFor(() => expect(server.current().items[1]).toMatchObject({ kilosReal: 0.65, picked: true }))
      expect(server.repo.changeItems).toHaveBeenCalledTimes(1)
      expect(server.repo.changeItems).toHaveBeenCalledWith('ord-1', [{ type: 'weight', itemId: 'prod-queso', kilosReal: 0.65 }], 5)
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
      expect(weightField('Queso campesino').value).toBe('0.65')
    })

    it('si el sondeo trae un cambio de OTRO producto, el peso se guarda con la versión vigente', async () => {
      const server = serve(order({ items: [milk, cheese] }))
      renderPage()
      await loaded()
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.6' } })
      server.byAnotherOperator({ type: 'pick', itemId: 'prod-leche', picked: true })
      await poll(2)
      await waitFor(() => expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'true'))

      fireEvent.blur(weightField('Queso campesino'))
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'true'))
      expect(server.repo.changeItems).toHaveBeenCalledTimes(1)
      expect(server.repo.changeItems).toHaveBeenCalledWith('ord-1', [{ type: 'weight', itemId: 'prod-queso', kilosReal: 0.6 }], 5)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(server.current().items.every((item) => item.picked)).toBe(true)
    })

    it('si el sondeo cambia la estructura (producto quitado) mientras se escribe, no se escribe', async () => {
      const server = serve(order({ substitutionPreference: 'remove', items: [milk, rice, cheese] }))
      renderPage()
      await loaded()
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.6' } })
      server.byAnotherOperator({ type: 'remove', itemId: 'prod-arroz' })
      await poll(2)
      await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Arroz' })).not.toBeInTheDocument())
      fireEvent.blur(weightField('Queso campesino'))
      expect(await screen.findByRole('alert')).toHaveTextContent('Otra persona cambió los productos del pedido')
      expect(server.repo.changeItems).not.toHaveBeenCalled()
      expect(weightField('Queso campesino').value).toBe('0.6')
    })

    it('si el sondeo trae justo el peso que se iba a guardar, no escribe de más y suelta el borrador', async () => {
      const server = serve(order())
      renderPage()
      await loaded()
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.6' } })
      server.byAnotherOperator({ type: 'weight', itemId: 'prod-queso', kilosReal: 0.6 })
      await poll(2)
      fireEvent.blur(weightField('Queso campesino'))
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'true'))
      expect(server.repo.changeItems).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(weightField('Queso campesino').value).toBe('0.6')
    })

    it('escribir mientras un guardado está en vuelo conserva lo escrito y lo guarda después con la base ya actualizada', async () => {
      const server = serve(order())
      const hold = server.holdNextChange()
      renderPage()
      await loaded()
      typeWeight('Queso campesino', '0.6')
      await screen.findByText('Guardando…')
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.65' } })
      fireEvent.blur(weightField('Queso campesino'))
      expect(server.repo.changeItems).toHaveBeenCalledTimes(1)

      hold.release()
      await waitFor(() => expect(server.current().items[1]).toMatchObject({ kilosReal: 0.65 }))
      expect(server.repo.changeItems.mock.calls.map((call) => [call[1], call[2]])).toEqual([
        [[{ type: 'weight', itemId: 'prod-queso', kilosReal: 0.6 }], 4],
        [[{ type: 'weight', itemId: 'prod-queso', kilosReal: 0.65 }], 5],
      ])
      await waitFor(() => expect(weightField('Queso campesino').value).toBe('0.65'))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('lo escrito durante un guardado sigue bloqueando Listo y no se pierde al terminar el anterior', async () => {
      const server = serve(order({ items: [pickedMilk, cheese] }))
      const hold = server.holdNextChange()
      renderPage()
      await loaded()
      typeWeight('Queso campesino', '0.6')
      await screen.findByText('Guardando…')
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.65' } })
      hold.release()
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'true'))
      expect(weightField('Queso campesino').value).toBe('0.65')
      expect(primary('Marcar como listo')).toBeDisabled()
      expect(server.repo.changeItems).toHaveBeenCalledTimes(1)
    })

    it('la base nueva tras el guardado propio detecta un cambio ajeno posterior sobre lo que se sigue escribiendo', async () => {
      const server = serve(order())
      const hold = server.holdNextChange()
      renderPage()
      await loaded()
      typeWeight('Queso campesino', '0.6')
      await screen.findByText('Guardando…')
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.65' } })
      hold.release()
      await waitFor(() => expect(checkbox('Queso campesino')).toHaveAttribute('aria-checked', 'true'))
      server.byAnotherOperator({ type: 'weight', itemId: 'prod-queso', kilosReal: 0.9 })
      await poll(2)

      fireEvent.blur(weightField('Queso campesino'))
      expect(await screen.findByRole('alert')).toHaveTextContent('Este producto lo cambió otra persona')
      expect(server.repo.changeItems).toHaveBeenCalledTimes(1)
      expect(server.current().items[1]).toMatchObject({ kilosReal: 0.9 })
      expect(weightField('Queso campesino').value).toBe('0.65')
    })

    it('si el sondeo publica un peso ajeno MÁS NUEVO antes de que llegue la respuesta propia, lo que se siguió escribiendo detecta el conflicto', async () => {
      const server = serve(order())
      const response = server.holdNextResponse()
      renderPage()
      await loaded()
      typeWeight('Queso campesino', '0.6')
      await screen.findByText('Guardando…')
      await waitFor(() => expect(server.current().items[1]).toMatchObject({ kilosReal: 0.6 }))
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.65' } })
      fireEvent.blur(weightField('Queso campesino'))
      server.byAnotherOperator({ type: 'weight', itemId: 'prod-queso', kilosReal: 0.9 })
      await poll(2)

      response.release()
      expect(await screen.findByRole('alert')).toHaveTextContent('Este producto lo cambió otra persona')
      expect(server.repo.changeItems).toHaveBeenCalledTimes(1)
      expect(server.current().items[1]).toMatchObject({ kilosReal: 0.9 })
      expect(weightField('Queso campesino').value).toBe('0.65')
      expect(primary('Marcar como listo')).toBeDisabled()
    })

    it('con el mismo desfase, un cambio ajeno de OTRO producto sí permite guardar lo escrito con la versión vigente', async () => {
      const server = serve(order({ items: [milk, cheese] }))
      const response = server.holdNextResponse()
      renderPage()
      await loaded()
      typeWeight('Queso campesino', '0.6')
      await screen.findByText('Guardando…')
      await waitFor(() => expect(server.current().items[1]).toMatchObject({ kilosReal: 0.6 }))
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.65' } })
      fireEvent.blur(weightField('Queso campesino'))
      server.byAnotherOperator({ type: 'pick', itemId: 'prod-leche', picked: true })
      await poll(2)

      response.release()
      await waitFor(() => expect(server.current().items[1]).toMatchObject({ kilosReal: 0.65, picked: true }))
      expect(server.repo.changeItems.mock.calls.map((call) => [call[1], call[2]])).toEqual([
        [[{ type: 'weight', itemId: 'prod-queso', kilosReal: 0.6 }], 4],
        [[{ type: 'weight', itemId: 'prod-queso', kilosReal: 0.65 }], 6],
      ])
      expect(server.current().items[0]).toMatchObject({ id: 'prod-leche', picked: true })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(weightField('Queso campesino').value).toBe('0.65')
    })

    it('tras ese conflicto, «Reintentar» adopta explícitamente el pedido actual y conserva lo escrito', async () => {
      const server = serve(order())
      const response = server.holdNextResponse()
      renderPage()
      await loaded()
      typeWeight('Queso campesino', '0.6')
      await screen.findByText('Guardando…')
      await waitFor(() => expect(server.current().items[1]).toMatchObject({ kilosReal: 0.6 }))
      fireEvent.change(weightField('Queso campesino'), { target: { value: '0.65' } })
      fireEvent.blur(weightField('Queso campesino'))
      server.byAnotherOperator({ type: 'weight', itemId: 'prod-queso', kilosReal: 0.9 })
      await poll(2)
      response.release()
      await screen.findByRole('alert')

      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      await waitFor(() => expect(server.current().items[1]).toMatchObject({ kilosReal: 0.65 }))
      expect(server.repo.changeItems).toHaveBeenLastCalledWith('ord-1', [{ type: 'weight', itemId: 'prod-queso', kilosReal: 0.65 }], 6)
    })
  })

  describe('guardados estructurales y confirmación de Listo', () => {
    const arepas: Product = { id: 'prod-arepa', name: 'Arepas', price: 3500, unit: '5 u', imageUrl: '', categoryId: 'c', inStock: true, is_variable_weight: false }

    it('mientras se guarda un quitar o sustituir, Listo sigue deshabilitado y nombra el producto', async () => {
      const server = serve(order({ items: [pickedMilk, weighedCheese] }))
      mocks.products = [arepas]
      renderPage()
      await loaded()
      expect(primary('Marcar como listo')).toBeEnabled()
      const hold = server.holdNextChange()
      fireEvent.click(screen.getByRole('button', { name: 'Falta Leche entera' }))
      const dialog = within(dialogs()[0]!)
      fireEvent.click(dialog.getByLabelText('Quitar del pedido'))
      fireEvent.click(dialog.getByRole('button', { name: 'Aplicar cambio' }))

      await waitFor(() => expect(primary('Marcar como listo')).toBeDisabled())
      expect(screen.getByText('Faltan 1: Leche entera')).toBeInTheDocument()
      expect(checkbox('Leche entera')).toBeDisabled()

      hold.release()
      await waitFor(() => expect(dialogs()).toHaveLength(0))
      await waitFor(() => expect(primary('Marcar como listo')).toBeEnabled())
      expect(screen.queryByRole('checkbox', { name: 'Leche entera' })).not.toBeInTheDocument()
    })

    it('si el guardado estructural falla, Listo vuelve a depender solo de lo que realmente falta', async () => {
      const server = serve(order({ items: [pickedMilk, weighedCheese] }))
      renderPage()
      await loaded()
      server.failNextChange(new ApiError({ kind: 'unavailable', status: 503, message: 'El servicio no está disponible. Intenta más tarde.' }))
      fireEvent.click(screen.getByRole('button', { name: 'Falta Leche entera' }))
      const dialog = within(dialogs()[0]!)
      fireEvent.click(dialog.getByLabelText('Quitar del pedido'))
      fireEvent.click(dialog.getByRole('button', { name: 'Aplicar cambio' }))
      expect(await dialog.findByRole('alert')).toHaveTextContent('El servicio no está disponible')
      expect(checkbox('Leche entera')).toBeEnabled()
      expect(primary('Marcar como listo')).toBeEnabled()
      expect(server.current().items).toHaveLength(2)
    })

    it('si algo se empieza a guardar con la confirmación de «Listo» abierta, esta se cierra y no se cierra la edición', async () => {
      const server = serve(order({ items: [pickedMilk, weighedCheese] }))
      renderPage()
      await loaded()
      fireEvent.click(primary('Marcar como listo'))
      expect(dialogs()).toHaveLength(1)
      const hold = server.holdNextChange()
      fireEvent.click(checkbox('Leche entera'))

      await waitFor(() => expect(dialogs()).toHaveLength(0))
      expect(mocks.toastError).toHaveBeenCalledWith('Hay cambios sin guardar. Revísalos antes de marcar el pedido como listo.')
      expect(server.repo.updateStatus).not.toHaveBeenCalled()
      expect(primary('Marcar como listo')).toBeDisabled()
      hold.release()
      await waitFor(() => expect(checkbox('Leche entera')).toHaveAttribute('aria-checked', 'false'))
      expect(server.repo.updateStatus).not.toHaveBeenCalled()
    })

    it('un borrador escrito en el mismo instante en que se confirma no cierra la edición', async () => {
      const server = serve(order({ items: [pickedMilk, weighedCheese] }))
      renderPage()
      await loaded()
      fireEvent.click(primary('Marcar como listo'))
      const confirm = within(dialogs()[0]!).getByRole('button', { name: 'Confirmar' })
      act(() => {
        fireEvent.change(weightField('Queso campesino'), { target: { value: '0.7' } })
        fireEvent.click(confirm)
      })
      expect(server.repo.updateStatus).not.toHaveBeenCalled()
      expect(mocks.toastError).toHaveBeenCalledWith('Hay cambios sin guardar. Revísalos antes de marcar el pedido como listo.')
      expect(weightField('Queso campesino').value).toBe('0.7')
      expect(primary('Marcar como listo')).toBeDisabled()
    })
  })
})
