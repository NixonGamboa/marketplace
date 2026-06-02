import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem } from '@/types'

const STALE_MS = 30 * 24 * 60 * 60 * 1000 // 30 días

interface CartStore {
  items: CartItem[]
  total: number
  count: number
  lastUpdated: number | null
  addItem: (item: CartItem) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  clearIfStale: () => void
}

function calcTotals(items: CartItem[]) {
  return {
    total: items.reduce((acc, i) => acc + i.price_at_moment * i.quantity, 0),
    count: items.reduce((acc, i) => acc + i.quantity, 0),
  }
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      total: 0,
      count: 0,
      lastUpdated: null,

      addItem: (item) => {
        const existing = get().items.find((i) => i.productId === item.productId)
        let items: CartItem[]
        if (existing) {
          items = get().items.map((i) =>
            i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i,
          )
        } else {
          items = [...get().items, { ...item, quantity: 1 }]
        }
        set({ items, ...calcTotals(items), lastUpdated: Date.now() })
      },

      removeItem: (productId) => {
        const items = get().items.filter((i) => i.productId !== productId)
        set({ items, ...calcTotals(items), lastUpdated: Date.now() })
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId)
          return
        }
        const items = get().items.map((i) =>
          i.productId === productId ? { ...i, quantity } : i,
        )
        set({ items, ...calcTotals(items), lastUpdated: Date.now() })
      },

      clearCart: () => set({ items: [], total: 0, count: 0, lastUpdated: null }),

      clearIfStale: () => {
        const { lastUpdated } = get()
        if (lastUpdated && Date.now() - lastUpdated > STALE_MS) {
          get().clearCart()
        }
      },
    }),
    {
      name: 'maui-cart',
      version: 1,
    },
  ),
)
