import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore } from '@/stores/cartStore'
import CheckoutPage from './CheckoutPage'
import { localCustomerPhone, useCheckoutStore } from './checkoutStore'
import { openStoreDto, renderWithQuery, testQueryClient } from './testUtils'

const submit = vi.hoisted(() => vi.fn())
vi.mock('@/services', () => ({ orderService: { submit } }))

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  useCheckoutStore.getState().reset()
  act(() => {
    useAuthStore.setState({ user: { id: 'cliente-1', name: 'Ana', phone: '573001234567', isAuthenticated: true }, isAuthenticated: true, sessionStatus: 'ready' })
    useCartStore.setState({ items: [{ productId: 'pan', name: 'Pan', imageUrl: '', price: 5000, price_at_moment: 5000, unit: 'und', quantity: 1, is_variable_weight: false }], total: 5000 })
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

const showDelivery = () => {
  renderWithQuery(<MemoryRouter><CheckoutPage /></MemoryRouter>, testQueryClient(openStoreDto()))
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
}

describe('presentación local del celular en checkout', () => {
  it.each(['+573001234567', '573001234567', '3001234567'])('precarga diez dígitos desde el perfil %s', (phone) => {
    const user = useAuthStore.getState().user!
    useAuthStore.setState({ user: { ...user, phone } })
    showDelivery()
    expect(screen.getByLabelText('Celular para este pedido')).toHaveValue('3001234567')
  })

  it('permite editar y pegar el indicativo; envía exactamente un 57 tras confirmar', async () => {
    submit.mockResolvedValue({ orderId: 'ord-9', status: 'received', estimatedTotal: 5000 })
    showDelivery()
    const input = screen.getByLabelText('Celular para este pedido')
    fireEvent.change(input, { target: { value: '+57 311 234 5678' } })
    expect(input).toHaveValue('3112345678')
    fireEvent.click(screen.getByRole('radio', { name: /^Recoger en tienda/i }))
    fireEvent.click(screen.getByRole('radio', { name: /Lo antes posible/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi Mercado' }))
    await waitFor(() => expect(submit).toHaveBeenCalledOnce())
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ customerPhone: '573112345678' })
  })

  it('conserva entradas incompletas o inválidas para que puedan corregirse', () => {
    expect(localCustomerPhone('+57 31')).toBe('+57 31')
    showDelivery()
    const input = screen.getByLabelText('Celular para este pedido')
    fireEvent.change(input, { target: { value: '311' } })
    expect(input).toHaveValue('311')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    fireEvent.change(input, { target: { value: '3112345678' } })
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })
})
