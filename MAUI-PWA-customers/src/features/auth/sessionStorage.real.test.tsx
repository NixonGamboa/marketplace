/**
 * Almacenamiento local por cuenta y carrito (modo real, servicio de auth simulado): cerrar o cambiar
 * de sesión no deja identidad ni datos del pedido en el navegador, y un fallo de red o una sesión
 * vencida nunca vacían el carrito. El carrito (productos y precios, sin datos personales) es del
 * dispositivo; solo se vacía cuando la persona lo hace o al comprar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/http/apiError'
import type { CustomerSession } from '@/services/real/adapters'

const auth = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }))
vi.mock('@/services/realAuthService', () => ({ realAuthService: auth }))

import { useAuthStore } from '@/stores/authStore'
import { useCartStore } from '@/stores/cartStore'
import { useCheckoutStore } from '@/features/checkout/checkoutStore'
import { queryClient } from '@/shared/queryClient'

const PHONE = '573105550177'
const session = (id: string, name: string): CustomerSession => ({
  user: { id, name, phone: PHONE, isAuthenticated: true },
  expiresAt: '2999-01-01T00:00:00.000Z',
})

const cartItem = { productId: 'prod-leche', name: 'Leche', imageUrl: '/x.png', price: 5000, price_at_moment: 5000, unit: '1 L', quantity: 1, is_variable_weight: false }

const storedText = () =>
  [window.localStorage, window.sessionStorage]
    .flatMap((storage) => Object.keys(storage).map((key) => `${key}=${storage.getItem(key)}`))
    .join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  queryClient.clear()
  useCheckoutStore.getState().reset()
  useCartStore.getState().clearCart()
  useAuthStore.setState({ user: null, isAuthenticated: false, loading: false, sessionStatus: 'ready', sessionExpired: false, sessionExpiresAt: null }, false)
})

describe('datos personales por cuenta', () => {
  it('iniciar y cerrar sesión no deja identidad ni datos del pedido en localStorage/sessionStorage', async () => {
    auth.login.mockResolvedValue(session('usr-1', 'Ana Pérez'))
    await useAuthStore.getState().signIn(`+${PHONE}`, 'clave-segura-123')
    useCheckoutStore.getState().setAddress('Calle 5 # 3-21, Dolores')
    useCheckoutStore.getState().setCustomerPhone(PHONE)
    useCartStore.getState().addItem(cartItem)
    expect(storedText()).not.toMatch(/Ana|Calle 5|usr-1/)
    expect(storedText()).not.toContain(PHONE)

    auth.logout.mockResolvedValue(undefined)
    await useAuthStore.getState().signOut()
    expect(storedText()).not.toMatch(/Ana|Calle 5|usr-1/)
    expect(storedText()).not.toContain(PHONE)
    expect(useCheckoutStore.getState()).toMatchObject({ address: null, customerPhone: null })
  })

  it('al cambiar de cuenta se descartan las consultas y el checkout de la anterior', async () => {
    auth.login.mockResolvedValueOnce(session('usr-1', 'Ana')).mockResolvedValueOnce(session('usr-2', 'Luis'))
    await useAuthStore.getState().signIn(`+${PHONE}`, 'clave-segura-123')
    queryClient.setQueryData(['orders', 'usr-1', {}], { pages: [{ items: [{ orderId: 'de-ana' }] }] })
    useCheckoutStore.getState().setAddress('Calle de Ana')

    await useAuthStore.getState().signIn('+573105550188', 'otra-clave-segura')
    expect(queryClient.getQueryData(['orders', 'usr-1', {}])).toBeUndefined()
    expect(useCheckoutStore.getState().address).toBeNull()
    expect(useAuthStore.getState().user?.id).toBe('usr-2')
  })
})

describe('el carrito sobrevive a fallos de red y de sesión', () => {
  beforeEach(() => { useCartStore.getState().addItem(cartItem) })

  const cartItems = () => useCartStore.getState().items.map((item) => item.productId)

  it('una consulta de sesión sin red no vacía el carrito ni inventa «sin sesión»', async () => {
    auth.me.mockRejectedValue(new ApiError({ kind: 'network', message: 'x' }))
    await useAuthStore.getState().restoreSession()
    expect(useAuthStore.getState().sessionStatus).toBe('failed')
    expect(cartItems()).toEqual(['prod-leche'])
  })

  it('un cierre de sesión que el servidor no confirma conserva la sesión y el carrito', async () => {
    auth.login.mockResolvedValue(session('usr-1', 'Ana'))
    await useAuthStore.getState().signIn(`+${PHONE}`, 'clave-segura-123')
    auth.logout.mockRejectedValue(new ApiError({ kind: 'network', message: 'x' }))
    await expect(useAuthStore.getState().signOut()).rejects.toBeInstanceOf(ApiError)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(cartItems()).toEqual(['prod-leche'])
  })

  it('una sesión vencida o un cierre exitoso purgan lo privado pero no el carrito', async () => {
    auth.login.mockResolvedValue(session('usr-1', 'Ana'))
    await useAuthStore.getState().signIn(`+${PHONE}`, 'clave-segura-123')
    useAuthStore.getState().expireSession()
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, sessionExpired: true })
    expect(cartItems()).toEqual(['prod-leche'])

    await useAuthStore.getState().signIn(`+${PHONE}`, 'clave-segura-123')
    auth.logout.mockResolvedValue(undefined)
    await useAuthStore.getState().signOut()
    expect(cartItems()).toEqual(['prod-leche'])
  })

  it('el carrito persistido es solo de productos: sin nombre, teléfono ni dirección de la cuenta', async () => {
    auth.login.mockResolvedValue(session('usr-1', 'Ana Pérez'))
    await useAuthStore.getState().signIn(`+${PHONE}`, 'clave-segura-123')
    useCheckoutStore.getState().setAddress('Calle 5 # 3-21')
    const persisted = window.localStorage.getItem('maui-cart') ?? ''
    expect(persisted).toContain('prod-leche')
    expect(persisted).not.toMatch(/Ana|Calle 5|usr-1/)
    expect(persisted).not.toContain(PHONE)
  })
})
