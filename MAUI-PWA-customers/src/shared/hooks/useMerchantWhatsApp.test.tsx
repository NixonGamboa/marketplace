import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { merchantWhatsAppUrl, readMerchantWhatsApp, useMerchantWhatsApp } from './useMerchantWhatsApp'

const key = 'maui-admin-merchant'

function storeWhatsApp(whatsapp: unknown) {
  window.localStorage.setItem(key, JSON.stringify({ mch_lechemiel: { whatsapp } }))
}

afterEach(() => window.localStorage.clear())

describe('WhatsApp del aliado', () => {
  it('oculta el número ausente, inválido o de ejemplo', () => {
    expect(readMerchantWhatsApp()).toBeNull()
    storeWhatsApp('573000000000')
    expect(readMerchantWhatsApp()).toBeNull()
    storeWhatsApp('texto')
    expect(readMerchantWhatsApp()).toBeNull()
  })

  it('lee y normaliza el número colombiano configurado', () => {
    storeWhatsApp('+57 301 555 0101')
    expect(readMerchantWhatsApp()).toBe('573015550101')
    storeWhatsApp('301 555 0101')
    expect(readMerchantWhatsApp()).toBe('573015550101')
    expect(merchantWhatsAppUrl('573015550101', 'Hola, MAUI'))
      .toBe('https://wa.me/573015550101?text=Hola%2C%20MAUI')
  })

  it('se actualiza cuando cambia localStorage en otra pestaña o la vista vuelve a primer plano', async () => {
    const { result } = renderHook(() => useMerchantWhatsApp())
    expect(result.current).toBeNull()

    storeWhatsApp('573015550101')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key })))
    await waitFor(() => expect(result.current).toBe('573015550101'))

    storeWhatsApp('573025550202')
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(result.current).toBe('573025550202'))
  })
})
