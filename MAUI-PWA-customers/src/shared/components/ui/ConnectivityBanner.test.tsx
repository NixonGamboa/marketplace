import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { catalogQueryKey, type CatalogSnapshot } from '@/hooks/useCatalog'
import { ConnectivityBanner } from './ConnectivityBanner'

const NOW = Date.parse('2026-10-03T12:00:00Z')
const snapshot = (cachedAt: number | null): CatalogSnapshot => ({ products: [], categories: [], cachedAt })

let online = true
const setOnline = (value: boolean) => {
  online = value
  act(() => { window.dispatchEvent(new Event(value ? 'online' : 'offline')) })
}

function renderBanner(cachedAt?: number | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (cachedAt !== undefined) client.setQueryData(catalogQueryKey(), snapshot(cachedAt))
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(<QueryClientProvider client={client}><ConnectivityBanner /></QueryClientProvider>)
  return { client, invalidate }
}

beforeEach(() => {
  online = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ConnectivityBanner', () => {
  it('con red y catálogo fresco no muestra nada ni vuelve a pedir datos', () => {
    const { invalidate } = renderBanner(null)
    expect(screen.queryByRole('status')).toBeNull()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('sin catálogo cargado y con red tampoco muestra nada', () => {
    renderBanner()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('sin red avisa y asegura que el carrito se conserva', () => {
    online = false
    renderBanner(null)
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Sin conexión')
    expect(banner).toHaveTextContent('Tu carrito se conserva')
    expect(screen.queryByRole('button', { name: 'Actualizar' })).toBeNull()
  })

  it('sin red y con copia guardada muestra su antigüedad y que se valida con la tienda', () => {
    online = false
    renderBanner(NOW - 2 * 3_600_000)
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Sin conexión')
    expect(banner).toHaveTextContent('catálogo guardado hace 2 h')
    expect(banner).toHaveTextContent('se validan con la tienda')
  })

  it('al recuperar la red vuelve a pedir el catálogo al servidor', () => {
    online = false
    const { invalidate } = renderBanner(NOW - 60_000)
    expect(invalidate).not.toHaveBeenCalled()

    setOnline(true)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: catalogQueryKey() })
  })

  it('con red y copia guardada ofrece actualizar manualmente', () => {
    const { invalidate } = renderBanner(NOW - 5 * 60_000)
    expect(screen.getByRole('status')).toHaveTextContent('hace 5 min')
    invalidate.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: catalogQueryKey() })
  })

  it('desaparece cuando el catálogo vuelve a llegar del servidor', async () => {
    const { client } = renderBanner(NOW - 60_000)
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => { client.setQueryData(catalogQueryKey(), snapshot(null)) })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})
