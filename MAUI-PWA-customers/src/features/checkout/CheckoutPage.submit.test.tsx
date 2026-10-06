import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '@/services/http/apiError'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore } from '@/stores/cartStore'
import CheckoutPage from './CheckoutPage'
import { useCheckoutStore } from './checkoutStore'
import { renderWithQuery } from './testUtils'

const submit = vi.hoisted(() => vi.fn())
vi.mock('@/services', () => ({ orderService: { submit } }))

const originalUser = useAuthStore.getState().user
const originalIsAuthenticated = useAuthStore.getState().isAuthenticated

afterEach(() => {
  cleanup()
  submit.mockReset()
  useCheckoutStore.getState().reset()
  useCartStore.getState().clearCart()
  useAuthStore.setState({ user: originalUser, isAuthenticated: originalIsAuthenticated })
})

const goToPayment = () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  act(() => {
    useAuthStore.setState({ user: { id: 'cliente-1', name: 'Ana', phone: '3001234567', isAuthenticated: true }, isAuthenticated: true })
    useCartStore.setState({
      items: [{ productId: 'pan', name: 'Pan', imageUrl: '', price: 5000, price_at_moment: 5000, unit: 'und', quantity: 1, is_variable_weight: false }],
      total: 5000,
    })
  })
  renderWithQuery(<MemoryRouter><CheckoutPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  fireEvent.click(screen.getByRole('radio', { name: /Recoger en tienda/i }))
  fireEvent.click(screen.getByRole('radio', { name: /Lo antes posible/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
}

describe('checkout: carrito y confirmación del pedido', () => {
  it('conserva el carrito y el checkout ante timeout/conflicto, y los limpia solo tras la confirmación', async () => {
    submit
      .mockRejectedValueOnce(new ApiError({ kind: 'timeout', message: 'x' }))
      .mockRejectedValueOnce(new ApiError({ kind: 'conflict', code: 'IDEMPOTENCY_KEY_REUSED', message: 'x' }))
      .mockResolvedValueOnce({ orderId: 'ord-9', status: 'received', estimatedTotal: 5000 })
    goToPayment()
    fireEvent.click(screen.getByRole('radio', { name: /Transferencia Bre-B/ }))
    expect(screen.getByText('Pago: Transferencia Bre-B')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al paso anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('radio', { name: /Transferencia Bre-B/ })).toBeChecked()
    expect(screen.queryByText('Pago seguro')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi Mercado' }))
    expect(await screen.findByText(/no se duplicará/)).not.toBeNull()
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCheckoutStore.getState().deliveryMode).toBe('pickup')
    expect(screen.getByRole('radio', { name: /Transferencia Bre-B/ })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi Mercado' }))
    expect(await screen.findByText(/Revisa Mis pedidos/)).not.toBeNull()
    expect(useCartStore.getState().items).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi Mercado' }))
    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(0))
    expect(submit).toHaveBeenCalledTimes(3)
    for (const call of submit.mock.calls) expect(call[0]).toMatchObject({ userId: 'cliente-1', customerPhone: '573001234567', paymentMethod: 'bre_b' })
  })
})
