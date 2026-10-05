/**
 * Feedback del celular de contacto en Entrega (PM-01), con servicios simulados (no es evidencia de
 * cierre real): mensaje junto al campo, estado inválido accesible y recuperación al corregir, sin
 * mostrar un error antes de que haya valor o interacción y conservando las guardas del asistente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore } from '@/stores/cartStore'
import CheckoutPage from './CheckoutPage'
import { useCheckoutStore } from './checkoutStore'
import { renderWithQuery } from './testUtils'

const submit = vi.hoisted(() => vi.fn())
vi.mock('@/services', () => ({ orderService: { submit } }))

const cartItem = { productId: 'pan', name: 'Pan', imageUrl: '', price: 5000, price_at_moment: 5000, unit: 'und', quantity: 1, is_variable_weight: false }

const signIn = (phone: string) => act(() => {
  useAuthStore.setState({ user: { id: 'cliente-1', name: 'Ana', phone, isAuthenticated: true }, isAuthenticated: true, sessionStatus: 'ready' })
  useCartStore.setState({ items: [cartItem], total: 5000 })
})

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => {
  cleanup()
  submit.mockReset()
  useCheckoutStore.getState().reset()
  useCartStore.getState().clearCart()
  useAuthStore.setState({ user: null, isAuthenticated: false })
  vi.restoreAllMocks()
})

const openDelivery = () => {
  renderWithQuery(<MemoryRouter><CheckoutPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  return screen.getByRole('textbox', { name: 'Celular para este pedido' })
}
const choosePickup = () => {
  fireEvent.click(screen.getByRole('radio', { name: /^Recoger en tienda/i }))
  fireEvent.click(screen.getByRole('radio', { name: /Lo antes posible/i }))
}
const cta = () => screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement
const errorOf = () => document.getElementById('checkout-customer-phone-error')

describe('celular del pedido: feedback de validación', () => {
  it('un celular precargado válido no muestra error', () => {
    signIn('573001234567')
    const phone = openDelivery()
    expect(phone).toHaveAttribute('aria-invalid', 'false')
    expect(phone).toHaveAttribute('aria-describedby', 'checkout-customer-phone-help')
    expect(errorOf()).toBeNull()
  })

  it('sin celular en el perfil no hay error rojo hasta que la persona sale del campo vacío', () => {
    signIn('')
    const phone = openDelivery()
    expect(phone).toHaveAttribute('aria-invalid', 'false')
    expect(errorOf()).toBeNull()
    fireEvent.blur(phone)
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(phone).toHaveAttribute('aria-describedby', 'checkout-customer-phone-error')
    expect(errorOf()).toHaveAttribute('role', 'alert')
    expect(errorOf()).toHaveTextContent('Escribe tu celular.')
    expect(phone.className).toContain('border-brand-error')
  })

  it('un celular mal formado muestra el error específico, mantiene la guarda y se recupera al corregir', () => {
    signIn('573001234567')
    const phone = openDelivery()
    choosePickup()
    expect(cta().disabled).toBe(false)

    fireEvent.change(phone, { target: { value: '200 123 4567' } })
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(phone).toHaveAttribute('aria-describedby', 'checkout-customer-phone-error')
    expect(errorOf()).toHaveTextContent('Ingresa un celular colombiano de 10 dígitos, con o sin +57.')
    expect(phone.className).toContain('border-brand-error')
    expect(cta().disabled).toBe(true)

    fireEvent.change(phone, { target: { value: '+57 311 222 3344' } })
    expect(phone).toHaveAttribute('aria-invalid', 'false')
    expect(phone).toHaveAttribute('aria-describedby', 'checkout-customer-phone-help')
    expect(errorOf()).toBeNull()
    expect(phone.className).not.toContain('border-brand-error')
    expect(cta().disabled).toBe(false)
  })

  it('un celular precargado mal formado se señala desde el inicio', () => {
    signIn('123')
    const phone = openDelivery()
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(errorOf()).toHaveTextContent('celular colombiano')
  })

  it('vaciar el campo pide el celular y corregirlo permite enviar con el número normalizado', async () => {
    submit.mockResolvedValue({ orderId: 'ord-1' })
    signIn('573001234567')
    const phone = openDelivery()
    choosePickup()
    fireEvent.change(phone, { target: { value: '' } })
    expect(errorOf()).toHaveTextContent('Escribe tu celular.')
    expect(cta().disabled).toBe(true)

    fireEvent.change(phone, { target: { value: '311 222 3344' } })
    expect(errorOf()).toBeNull()
    fireEvent.click(cta())
    fireEvent.click(await screen.findByRole('button', { name: 'Pedir mi Mercado' }))
    await waitFor(() => expect(submit).toHaveBeenCalledOnce())
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ customerPhone: '573112223344' }))
  })
})
