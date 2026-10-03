/**
 * Checkout real con servicios simulados (no es evidencia de cierre real): reglas de la tienda del
 * servidor (horario, domicilio, franjas, envío, cobertura), conciliación del carrito y envío con
 * identidad de la sesión. El servidor siempre revalida.
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

  it('el domicilio no disponible (corte o desactivado) se deshabilita y deja recoger en tienda', () => {
    renderCheckout(openStoreDto({ availability: { ...openStoreDto().availability, acceptsDelivery: false } }))
    next()
    expect(screen.getByRole('radio', { name: /Envío a domicilio/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^Recoger en tienda/i })).toBeEnabled()
  })

  it('la nota de cobertura y el envío salen del servidor', () => {
    renderCheckout(openStoreDto({ delivery: { ...openStoreDto().delivery, shippingCost: 4500, freeShippingThreshold: null, coverageNote: 'Cobertura: barrio centro' } }))
    next()
    fireEvent.click(screen.getByRole('radio', { name: /Envío a domicilio/i }))
    expect(screen.getByText('Cobertura: barrio centro')).toBeInTheDocument()
  })

  it('con la tienda cerrada no se puede confirmar y se explica por qué', () => {
    renderCheckout(openStoreDto({ availability: { ...openStoreDto().availability, isOpen: false, closedReason: 'after_closing', acceptsPickup: false, acceptsDelivery: false } }))
    next()
    fireEvent.click(screen.getByRole('radio', { name: /^Recoger en tienda/i }))
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(submit).not.toHaveBeenCalled()
  })

  it('sin reglas del servidor no se confirma ni se inventa un envío', () => {
    renderWithQuery(<MemoryRouter><CheckoutPage /></MemoryRouter>, testQueryClient(null))
    next()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
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

  it('un rechazo del servidor (tienda cerrada) se muestra y conserva el carrito', async () => {
    submit.mockRejectedValue(new ApiError({ kind: 'validation', status: 400, code: 'STORE_CLOSED', message: 'La tienda está cerrada en este momento' }))
    renderCheckout()
    goToPayment()
    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi Mercado' }))
    expect(await screen.findByText('La tienda está cerrada en este momento')).toBeInTheDocument()
    expect(useCartStore.getState().items).toHaveLength(1)
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
    expect(rules).toMatchObject({ status: 'ready', isOpen: true, acceptsDelivery: false, acceptsPickup: true, shipping: { cost: 3000, freeThreshold: 30000 } })
    expect(rules.slots.map((slot) => slot.value)).toEqual(['morning', 'asap'])
    expect(rules.slotLabel('morning')).toContain('08:00 – 12:00')
    expect(rules.slotLabel('asap')).toBe('Lo antes posible')
  })
})
