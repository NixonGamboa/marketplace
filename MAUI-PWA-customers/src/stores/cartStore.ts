import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, Product } from '@/types'

const STALE_MS = 30 * 24 * 60 * 60 * 1000 // 30 días
const roundKg = (v: number) => parseFloat(v.toFixed(2))

interface CartStore {
  items: CartItem[]
  total: number
  lastUpdated: number | null
  addItem: (item: CartItem) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  updateKilos: (productId: string, kilos: number) => void
  clearCart: () => void
  clearIfStale: () => void
  /** Actualiza precio, nombre y unidad de lo que ya está en el carrito al valor vigente del catálogo. */
  syncWithCatalog: (products: readonly Product[]) => void
}

function calcTotals(items: CartItem[]) {
  return {
    total: items.reduce((acc, i) => {
      const qty = i.is_variable_weight ? (i.kilos ?? 1) : i.quantity
      return acc + i.price_at_moment * qty
    }, 0),
  }
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      total: 0,
      lastUpdated: null,

      addItem: (item) => {
        let found = false
        const updated = get().items.map((i) => {
          if (i.productId !== item.productId) return i
          found = true
          return item.is_variable_weight && item.kilos != null
            ? { ...i, kilos: roundKg((i.kilos ?? 0) + item.kilos) }
            : { ...i, quantity: i.quantity + 1 }
        })
        const items = found ? updated : [...updated, { ...item, quantity: 1 }]
        set({ items, ...calcTotals(items), lastUpdated: Date.now() })
      },

      removeItem: (productId) => {
        const items = get().items.filter((i) => i.productId !== productId)
        set({ items, ...calcTotals(items), lastUpdated: Date.now() })
      },

      updateKilos: (productId, kilos) => {
        if (kilos <= 0) {
          get().removeItem(productId)
          return
        }
        const items = get().items.map((i) =>
          i.productId === productId ? { ...i, kilos: roundKg(kilos) } : i,
        )
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

      clearCart: () => set({ items: [], total: 0, lastUpdated: null }),

      syncWithCatalog: (products) => {
        const byId = new Map(products.map((product) => [product.id, product]))
        let changed = false
        const items = get().items.map((item) => {
          const product = byId.get(item.productId)
          if (!product || product.is_variable_weight !== item.is_variable_weight) return item
          const name = product.name_display ?? product.name
          if (item.price_at_moment === product.price && item.name === name && item.unit === product.unit && item.imageUrl === product.imageUrl) return item
          changed = true
          return { ...item, name, price: product.price, price_at_moment: product.price, unit: product.unit, imageUrl: product.imageUrl }
        })
        // Sin cambios no se escribe: evita renders y un bucle con el efecto que lo llama.
        if (changed) set({ items, ...calcTotals(items) })
      },

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
