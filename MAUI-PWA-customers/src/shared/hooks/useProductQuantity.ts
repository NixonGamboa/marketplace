import { useCartStore } from '@/stores/cartStore'

export function useProductQuantity(productId: string | undefined) {
  const quantity = useCartStore((s) =>
    productId ? (s.items.find((i) => i.productId === productId)?.quantity ?? 0) : 0,
  )
  const kilos = useCartStore((s) =>
    productId ? (s.items.find((i) => i.productId === productId)?.kilos ?? 0) : 0,
  )
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)

  const increment = () => {
    if (!productId) return
    updateQuantity(productId, quantity + 1)
  }

  const decrement = () => {
    if (!productId) return
    if (quantity <= 1) removeItem(productId)
    else updateQuantity(productId, quantity - 1)
  }

  return { quantity, kilos, increment, decrement }
}
