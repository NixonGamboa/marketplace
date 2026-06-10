export interface CartItem {
  productId: string
  name: string
  imageUrl: string
  price: number
  price_at_moment: number  // snapshot del precio al momento de agregar al carrito
  unit: string
  quantity: number
  is_variable_weight: boolean // para mostrar badge en CartItemRow
  kilos?: number // kilogramos seleccionados; solo para is_variable_weight === true
}

export interface CartState {
  items: CartItem[]
  total: number
  count: number
}
