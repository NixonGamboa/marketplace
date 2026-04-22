import type { Product } from '@/types/catalog'
import type { CartItem } from '@/types/cart'

/**
 * Convierte un Product en un CartItem listo para agregar al carrito.
 * Centraliza la conversión — Single Responsibility.
 * El campo `quantity` lo agrega el caller (cartStore.addItem).
 */
export function productToCartItem(product: Product): Omit<CartItem, 'quantity'> {
  return {
    productId: product.id,
    name: product.name_display ?? product.name,
    imageUrl: product.imageUrl,
    price: product.price,
    price_at_moment: product.price, // snapshot del precio actual
    unit: product.unit,
    is_variable_weight: product.is_variable_weight,
  }
}
