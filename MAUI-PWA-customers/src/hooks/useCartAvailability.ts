import { useEffect, useMemo } from 'react'
import { isDemoMode } from '@/config/mode'
import { useCartStore } from '@/stores/cartStore'
import type { CartItem } from '@/types'
import { useProducts } from './useCatalog'

/**
 * Concilia el carrito con el catálogo del servidor (solo modo real): los precios guardados se
 * actualizan al vigente y se informan los productos que ya no se pueden pedir (agotados, retirados
 * o cuya forma de venta cambió). El servidor sigue siendo la autoridad al crear el pedido.
 */
export function useCartAvailability(): { unavailable: CartItem[]; checking: boolean; failed: boolean; retry(): void } {
  const items = useCartStore((s) => s.items)
  const syncWithCatalog = useCartStore((s) => s.syncWithCatalog)
  const { data: products, isLoading, isError, refetch } = useProducts()
  const real = !isDemoMode()

  useEffect(() => {
    if (real && products) syncWithCatalog(products)
  }, [real, products, syncWithCatalog])

  const unavailable = useMemo(() => {
    if (!real || !products) return []
    const byId = new Map(products.map((product) => [product.id, product]))
    return items.filter((item) => {
      const product = byId.get(item.productId)
      return !product || !product.inStock || product.is_variable_weight !== item.is_variable_weight
    })
  }, [real, products, items])

  return { unavailable, checking: real && isLoading, failed: real && isError, retry: () => void refetch() }
}
