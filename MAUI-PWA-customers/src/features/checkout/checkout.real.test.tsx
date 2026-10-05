/**
 * Checkout real con servicios simulados (no es evidencia de cierre real): reglas de la tienda del
 * servidor (domicilio, franjas, envío, cobertura), recepción permanente fuera de horario (PM-03),
 * conciliación del carrito y envío con identidad de la sesión. El servidor siempre revalida.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '@/services/http/apiError'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore } from '@/stores/cartStore'
import CheckoutPage from './CheckoutPage'
import { useCheckoutStore } from './checkoutStore'
import { calculateShipping } from './shipping'
import { realCatalogService } from '@/services/realCatalogService'
import { rulesFromStore } from './storeRules'
import { openStoreDto, renderWithQuery, testQueryClient } from './testUtils'

const submit = vi.hoisted(() => vi.fn())
vi.mock('@/services', () => ({ orderService: { submit } }))

const cartItem = { productId: 'pan', name: 'Pan', imageUrl: '', price: 5000, price_at_moment: 5000, unit: 'und', quantity: 1, is_variable_weight: false }

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  act(() => {
    useAuthStore.setState({ user: { id: 'cliente-1', name: 'Ana', phone: '573001234567', isAuthenticated: true }, isAuthenticated: true, sessionStatus: 'ready' })
    useCartStore.setState({ items: [cartItem], total: 5000 })
  })
})
afterEach(() => {
  cleanup()
  submit.mockReset()
  useCheckoutStore.getState().reset()
  useCartStore.getState().clearCart()
  useAuthStore.setState({ user: null, isAuthenticated: false })
  vi.restoreAllMocks()
})

const renderCheckout = (store = openStoreDto()) =>
  renderWithQuery(<MemoryRouter><CheckoutPage /></MemoryRouter>, testQueryClient(store))
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

describe('reglas de la tienda en el checkout (modo real)', () => {
  it('muestra solo las franjas vigentes del servidor, con su ventana', () => {
    renderCheckout(openStoreDto({ availability: { ...openStoreDto().availability, availableTimeSlots: ['afternoon', 'asap'] } }))
    next()
    fireEvent.click(screen.getByRole('radio', { name: /^Recoger en tienda/i }))
    expect(screen.queryByRole('radio', { name: /Mañana/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /Tarde/ })).toHaveTextContent('12:00 – 17:00')
    expect(screen.getByRole('radio', { name: /Lo antes posible/ })).toBeInTheDocument()
  })

  it('el domicilio deshabilitado en la configuración no se ofrece y deja recoger en tienda', () => {
    renderCheckout(openStoreDto({ availability: { ...openStoreDto().availability, acceptsDelivery: false } }))
    next()
    expect(screen.getByRole('radio', { name: /Envío a domicilio/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^Recoger en tienda/i })).toBeEnabled()
    expect(screen.getByText('Domicilio no disponible; puedes recoger en tienda')).toBeInTheDocument()
  })

  it('la nota de cobertura y el envío salen del servidor', () => {
    renderCheckout(openStoreDto({ delivery: { ...openStoreDto().delivery, shippingCost: 4500, freeShippingThreshold: null, coverageNote: 'Cobertura: barrio centro' } }))
    next()
    fireEvent.click(screen.getByRole('radio', { name: /Envío a domicilio/i }))
    expect(screen.getByText('Cobertura: barrio centro')).toBeInTheDocument()
  })

  it.each(['override_closed', 'day_closed', 'before_opening', 'after_closing'] as const)(
    'fuera de atención (%s) se puede elegir cada modalidad y continuar, sin avisos de cierre', (closedReason) => {
    const closed = openStoreDto({ availability: { ...openStoreDto().availability, isOpen: false, closedReason, localTime: '21:00' } })
    renderCheckout(closed)
    next()
    expect(screen.getByRole('radio', { name: /Envío a domicilio/i })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /^Recoger en tienda/i })).toBeEnabled()
    // Recogida: franja y continuar.
    fireEvent.click(screen.getByRole('radio', { name: /^Recoger en tienda/i }))
    fireEvent.click(screen.getByRole('radio', { name: /Mañana/ }))
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
    // Domicilio: dirección y continuar.
    fireEvent.click(screen.getByRole('radio', { name: /Envío a domicilio/i }))
    fireEvent.change(screen.getByLabelText(/Dirección o referencia/), { target: { value: 'Calle 5 # 4-12' } })
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
    // El aviso de procesamiento solo existe tras persistir el pedido, nunca antes.
    expect(screen.queryByText(/Recibimos tu pedido|descansando|cerr[oó]|no abre/i)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('fuera de atención se llega a Pago y se envía el pedido con sus datos', async () => {
    submit.mockResolvedValueOnce({ orderId: 'ord-cerrada', status: 'received', estimatedTotal: 5000, processingNotice: { kind: 'unscheduled', reason: 'override_closed' } })
    renderCheckout(openStoreDto({ availability: { ...openStoreDto().availability, isOpen: false, closedReason: 'override_closed', availableTimeSlots: ['morning', 'afternoon', 'asap'] } }))
    next()
    fireEvent.click(screen.getByRole('radio', { name: /^Recoger en tienda/i }))
    fireEvent.click(screen.getByRole('radio', { name: /Mañana/ }))
    next()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi Mercado' }))
    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(0))
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ deliveryType: 'pickup', deliveryData: { timeSlot: 'morning' } })
  })

  it('una franja incompatible con la fecha de procesamiento se explica y no deja continuar', () => {
    renderCheckout(openStoreDto({ availability: { ...openStoreDto().availability, isOpen: false, closedReason: 'after_closing', availableTimeSlots: ['afternoon', 'asap'] } }))
    next()
    fireEvent.click(screen.getByRole('radio', { name: /^Recoger en tienda/i }))
    expect(screen.queryByRole('radio', { name: /Mañana/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /Tarde/ })).toBeInTheDocument()
  })

  describe('fecha de las franjas ofrecidas', () => {
    const base = openStoreDto().availability
    const withSlots = (availability: Partial<typeof base>) => openStoreDto({ availability: { ...base, ...availability } })
    const pickPickup = () => { next(); fireEvent.click(screen.getByRole('radio', { name: /^Recoger en tienda/i })) }

    it('franjas de hoy: sin etiqueta de día', () => {
      renderCheckout(withSlots({ timeSlotsDate: '2026-10-02' }))
      pickPickup()
      expect(screen.queryByText(/Franjas para/)).toBeNull()
    })

    it.each([
      ['tras el cierre', { isOpen: false, closedReason: 'after_closing', localTime: '21:00', timeSlotsDate: '2026-10-03' }, 'el sábado, 3 de octubre'],
      ['día sin atención', { isOpen: false, closedReason: 'day_closed', timeSlotsDate: '2026-10-05' }, 'el lunes, 5 de octubre'],
      ['atendiendo con las franjas de hoy vencidas', { isOpen: true, localTime: '14:00', timeSlotsDate: '2026-10-03' }, 'el sábado, 3 de octubre'],
    ] as const)('%s: dice la fecha del servidor, sin «hoy» ni «mañana» relativos', (_name, availability, day) => {
      renderCheckout(withSlots(availability))
      pickPickup()
      expect(screen.getByText('Franjas para ' + day + '.')).toBeInTheDocument()
      expect(screen.queryByText(/\bhoy\b/i)).toBeNull()
      fireEvent.click(screen.getByRole('radio', { name: /Mañana/ }))
      // «Mañana» es la franja de la mañana: el texto usa su ventana, nunca «tu pedido mañana».
      expect(screen.getByRole('radio', { name: /^Recoger en tienda/i })).toHaveTextContent('Recoge tu pedido entre 08:00 y 12:00 · ' + day)
      next()
      expect(screen.getByText('Recoges en tienda — Mañana (08:00 – 12:00) · ' + day)).toBeInTheDocument()
      expect(screen.queryByText(/Recibimos tu pedido|descansando/)).toBeNull()
    })

    it('reapertura desconocida: franjas habilitadas sin inventar fecha', () => {
      renderCheckout(withSlots({ isOpen: false, closedReason: 'override_closed' }))
      pickPickup()
      expect(screen.getByText('Franjas para cuando retomemos la atención.')).toBeInTheDocument()
    })

    it('configuración sin ninguna franja habilitada: mensaje explícito, no continúa en recogida y deja el domicilio', () => {
      const none = openStoreDto({
        timeSlots: openStoreDto().timeSlots.map((slot) => ({ ...slot, enabled: false })),
        availability: { ...base, availableTimeSlots: [] },
      })
      renderCheckout(none)
      pickPickup()
      expect(screen.getAllByText('La tienda no tiene franjas de recogida habilitadas.').length).toBeGreaterThan(0)
      expect(screen.getByRole('alert')).toHaveTextContent('La tienda no tiene franjas de recogida habilitadas. Elige domicilio.')
      expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
      fireEvent.click(screen.getByRole('radio', { name: /Envío a domicilio/i }))
      fireEvent.change(screen.getByLabelText(/Dirección o referencia/), { target: { value: 'Calle 5 # 4-12' } })
      expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
    })

    it('franjas habilitadas que no caben en el horario: se distingue de «sin franjas habilitadas»', () => {
      renderCheckout(withSlots({ availableTimeSlots: [] }))
      pickPickup()
      expect(screen.getByRole('alert')).toHaveTextContent('Las franjas de recogida habilitadas no coinciden con el horario de atención.')
      expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    })

    it('con el domicilio deshabilitado no se sugiere elegirlo', () => {
      renderCheckout(openStoreDto({
        timeSlots: openStoreDto().timeSlots.map((slot) => ({ ...slot, enabled: false })),
        availability: { ...base, availableTimeSlots: [], acceptsDelivery: false },
      }))
      pickPickup()
      expect(screen.getByRole('alert')).toHaveTextContent(/^La tienda no tiene franjas de recogida habilitadas\.(?! Elige domicilio)/)
    })
  })

  it('cargando las reglas: se explica en Entrega y no se puede continuar', async () => {
    vi.spyOn(realCatalogService, 'getStore').mockReturnValue(new Promise(() => undefined))
    renderWithQuery(<MemoryRouter><CheckoutPage /></MemoryRouter>, testQueryClient(null))
    next()
    expect(await screen.findByRole('alert')).toHaveTextContent('Cargando las reglas de la tienda…')
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^Recoger en tienda/i })).toBeDisabled()
  })

  it('error al cargar las reglas: mensaje explícito, reintento y se recupera sin inventar un envío', async () => {
    const getStore = vi.spyOn(realCatalogService, 'getStore').mockRejectedValue(new ApiError({ kind: 'network', message: 'sin red' }))
    renderWithQuery(<MemoryRouter><CheckoutPage /></MemoryRouter>, testQueryClient(null))
    next()
    expect(await screen.findByText('No pudimos cargar las reglas de la tienda.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    getStore.mockResolvedValue(openStoreDto({ availability: { ...openStoreDto().availability, isOpen: false, closedReason: 'after_closing' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Recoger en tienda/i })).toBeEnabled())
    expect(screen.queryByText('No pudimos cargar las reglas de la tienda.')).toBeNull()
  })
})

describe('envío con identidad real', () => {
  const goToPayment = () => {
    next()
    fireEvent.click(screen.getByRole('radio', { name: /^Recoger en tienda/i }))
    fireEvent.click(screen.getByRole('radio', { name: /Lo antes posible/i }))
    next()
  }

  it('envía el ID y nombre de la sesión y el celular canónico; el carrito se limpia solo tras confirmar', async () => {
    submit.mockRejectedValueOnce(new ApiError({ kind: 'timeout', message: 'x' }))
      .mockResolvedValueOnce({ orderId: 'ord-9', status: 'received', estimatedTotal: 5000 })
    renderCheckout()
    goToPayment()
    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi Mercado' }))
    expect(await screen.findByText(/no se duplicará/)).not.toBeNull()
    expect(useCartStore.getState().items).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi Mercado' }))
    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(0))
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ userId: 'cliente-1', customerName: 'Ana', customerPhone: '573001234567', deliveryType: 'pickup' })
  })

  it('un rechazo del servidor (restricción ajena al horario) se muestra, conserva el carrito y no anuncia recepción', async () => {
    submit.mockRejectedValue(new ApiError({ kind: 'validation', status: 400, code: 'TIME_SLOT_UNAVAILABLE', message: 'La franja elegida no está disponible' }))
    renderCheckout()
    goToPayment()
    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi Mercado' }))
    expect(await screen.findByText('La franja elegida no está disponible')).toBeInTheDocument()
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(screen.queryByText(/Recibimos tu pedido/)).toBeNull()
  })

  it('sin sesión no envía nada y pide iniciar sesión', async () => {
    renderCheckout()
    goToPayment()
    act(() => useAuthStore.setState({ user: null, isAuthenticated: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi Mercado' }))
    expect(await screen.findByText(/Inicia sesión para hacer tu pedido/)).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
  })
})

describe('reglas puras de envío y de la tienda', () => {
  it('calculateShipping respeta costo y umbral del servidor, y «nunca gratis»', () => {
    expect(calculateShipping(29_999, { cost: 4500, freeThreshold: 30_000 })).toEqual({ cost: 4500, isFree: false, freeThreshold: 30_000 })
    expect(calculateShipping(30_000, { cost: 4500, freeThreshold: 30_000 })).toEqual({ cost: 0, isFree: true, freeThreshold: 30_000 })
    expect(calculateShipping(1_000_000, { cost: 4500, freeThreshold: null })).toMatchObject({ cost: 4500, isFree: false })
  })

  it('rulesFromStore traduce disponibilidad, franjas y envío', () => {
    const rules = rulesFromStore(openStoreDto({ availability: { ...openStoreDto().availability, availableTimeSlots: ['morning', 'asap'], acceptsDelivery: false } }), () => undefined)
    expect(rules).toMatchObject({ status: 'ready', acceptsDelivery: false, acceptsPickup: true, shipping: { cost: 3000, freeThreshold: 30000 } })
    expect(rules.slots.map((slot) => slot.value)).toEqual(['morning', 'asap'])
    expect(rules.slotLabel('morning')).toContain('08:00 – 12:00')
    expect(rules.slotLabel('asap')).toBe('Lo antes posible')
  })
})
