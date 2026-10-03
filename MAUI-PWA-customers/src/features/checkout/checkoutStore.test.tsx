import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CheckoutPage from './CheckoutPage'
import DeliverySelector from './DeliverySelector'
import { DEMO_CHECKOUT_RULES } from './storeRules'
import { renderWithQuery } from './testUtils'
import { mapCartItemsToOrderItems, normalizeCustomerPhone, useCheckoutStore, useIsDeliveryReady } from './checkoutStore'
import { useCartStore } from '@/stores/cartStore'
import { useAuthStore } from '@/stores/authStore'

const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation')
const originalUser = useAuthStore.getState().user
const originalIsAuthenticated = useAuthStore.getState().isAuthenticated

function DeliveryReady() {
  return <span>{useIsDeliveryReady() ? 'Entrega lista' : 'Entrega pendiente'}</span>
}

beforeEach(() => {
  useCheckoutStore.getState().reset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useCartStore.getState().clearCart()
  useAuthStore.setState({ user: originalUser, isAuthenticated: originalIsAuthenticated })
  if (originalGeolocation) {
    Object.defineProperty(navigator, 'geolocation', originalGeolocation)
  } else {
    Reflect.deleteProperty(navigator, 'geolocation')
  }
})

describe('checkout contact and location', () => {
  it('normalizes valid Colombian mobile numbers and rejects invalid input', () => {
    expect(normalizeCustomerPhone('300 123 4567')).toBe('573001234567')
    expect(normalizeCustomerPhone('+57 (300) 123-4567')).toBe('573001234567')
    expect(normalizeCustomerPhone('573001234567')).toBe('573001234567')
    expect(normalizeCustomerPhone('601 123 4567')).toBeNull()
    expect(normalizeCustomerPhone('300 123 456')).toBeNull()
  })

  it('sends requested kilograms and the per-kilogram price snapshot', () => {
    expect(mapCartItemsToOrderItems([
      {
        productId: 'queso', name: 'Queso', imageUrl: '', price: 32000,
        price_at_moment: 30000, unit: 'kg', quantity: 1,
        is_variable_weight: true, kilos: 0.75,
      },
      {
        productId: 'pan', name: 'Pan', imageUrl: '', price: 6000,
        price_at_moment: 5000, unit: 'und', quantity: 2,
        is_variable_weight: false,
      },
    ])).toEqual([
      { id: 'queso', qty: 1, priceAtMoment: 30000, is_variable_weight: true, kilosRequested: 0.75 },
      { id: 'pan', qty: 2, priceAtMoment: 5000 },
    ])
  })

  it('requires a valid phone and either coordinates or an address for delivery', () => {
    render(<DeliveryReady />)
    act(() => {
      const checkout = useCheckoutStore.getState()
      checkout.setDeliveryMode('delivery')
      checkout.setCoordinates(4.6, -74.1)
    })
    expect(screen.queryByText('Entrega pendiente')).not.toBeNull()

    act(() => useCheckoutStore.getState().setCustomerPhone('+57 300 123 4567'))
    expect(screen.queryByText('Entrega lista')).not.toBeNull()

    act(() => useCheckoutStore.getState().setAddress('Portería principal'))
    expect(useCheckoutStore.getState()).toMatchObject({
      address: 'Portería principal',
      lat: 4.6,
      lng: -74.1,
    })
  })

  it('pickup requires phone and time slot but no location', () => {
    render(<DeliveryReady />)
    act(() => useCheckoutStore.getState().setDeliveryMode('pickup'))
    expect(screen.queryByText('Entrega pendiente')).not.toBeNull()

    act(() => useCheckoutStore.getState().setCustomerPhone('300 123 4567'))
    expect(screen.queryByText('Entrega pendiente')).not.toBeNull()

    act(() => useCheckoutStore.getState().setTimeSlot('morning'))
    expect(screen.queryByText('Entrega lista')).not.toBeNull()
    expect(useCheckoutStore.getState()).toMatchObject({ address: null, lat: null, lng: null })
  })

  it('places the GPS action before manual address and keeps manual fallback', () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
    render(<DeliverySelector rules={DEMO_CHECKOUT_RULES} />)
    fireEvent.click(screen.getByRole('radio', { name: /Envío a domicilio/i }))

    const gps = screen.getByRole('button', { name: 'Enviar ubicación actual' })
    const address = screen.getByRole('textbox', { name: /Dirección o referencia/i })
    expect(gps.compareDocumentPosition(address) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(gps)
    expect(screen.getByRole('alert').textContent).toContain('Ingresa la dirección manualmente')
    fireEvent.change(address, { target: { value: 'Calle 5 #12-34' } })
    expect(useCheckoutStore.getState().address).toBe('Calle 5 #12-34')
    expect((screen.getByRole('button', { name: 'Confirmar entrega' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps coordinates after entering a delivery reference', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => success({
          coords: { latitude: 4.6, longitude: -74.1 },
        } as GeolocationPosition),
      },
    })
    render(<DeliverySelector rules={DEMO_CHECKOUT_RULES} />)
    fireEvent.click(screen.getByRole('radio', { name: /Envío a domicilio/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ubicación actual' }))
    expect(screen.queryByText(/Ubicación obtenida/)).not.toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: /Dirección o referencia/i }), {
      target: { value: 'Portería del edificio azul' },
    })
    expect(useCheckoutStore.getState()).toMatchObject({
      address: 'Portería del edificio azul',
      lat: 4.6,
      lng: -74.1,
    })
  })

  it('prefills the phone from the profile, validates edits, and shows the chosen number in payment', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    act(() => {
      useAuthStore.setState({
        user: { id: 'cliente-1', name: 'Ana', phone: '+573001234567', isAuthenticated: true },
        isAuthenticated: true,
      })
      useCartStore.setState({
        items: [{
          productId: 'pan', name: 'Pan', imageUrl: '', price: 5000,
          price_at_moment: 5000, unit: 'und', quantity: 1,
          is_variable_weight: false,
        }],
        total: 5000,
      })
    })

    renderWithQuery(<MemoryRouter><CheckoutPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    const phone = screen.getByRole('textbox', { name: 'Celular para este pedido' }) as HTMLInputElement
    expect(phone.value).toBe('+573001234567')
    fireEvent.click(screen.getByRole('radio', { name: /Recoger en tienda/i }))
    fireEvent.click(screen.getByRole('radio', { name: /Lo antes posible/i }))

    fireEvent.change(phone, { target: { value: '123' } })
    expect((screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(phone, { target: { value: '311 222 3344' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('311 222 3344')).not.toBeNull()
    expect(screen.getByText('No aplica')).not.toBeNull()
    expect(useAuthStore.getState().user?.phone).toBe('+573001234567')
  })
})
