import { useCartStore } from '@/stores/cartStore'
import type { Product } from '@/types'
import { productToCartItem } from '@/features/catalog/mappers'

export function useCart() {
  const { items, addItem, removeItem, updateQuantity, updateKilos, clearCart, total } = useCartStore()
  return { items, addItem, removeItem, updateQuantity, updateKilos, clearCart, total }
}

export function useAddToCart() {
  const addItem = useCartStore((s) => s.addItem)
  return (product: Product) => addItem({ ...productToCartItem(product), quantity: 1 })
}
