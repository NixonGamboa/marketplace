export interface Product {
  id: string
  name: string
  name_display?: string  // nombre corto para UI: "Leche Entera"
  name_legal?: string    // nombre legal completo para recibos
  price: number
  unit: string
  imageUrl: string
  categoryId: string     // FK a Category.id
  inStock: boolean       // false → ocultar botón +, mostrar badge "Agotado"
  is_variable_weight: boolean // true → mostrar badge naranja de peso variable
  badge?: string
  currency?: string
}

export interface Category {
  id: string
  name: string
  icon?: string
  slug?: string           // URL-safe: 'lacteos', 'abarrotes'
  illustrationUrl?: string // ruta al SVG de diseño (fallback: icono lucide)
  order?: number          // orden en el grid de Pasillos
}
