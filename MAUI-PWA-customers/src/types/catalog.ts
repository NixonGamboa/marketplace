export interface Product {
  id: string
  name: string
  name_display?: string  // nombre corto para UI: "Leche Entera"
  name_legal?: string    // nombre legal completo para recibos
  price: number
  originalPrice?: number // precio antes del descuento para mostrar tachado
  unit: string
  imageUrl: string
  categoryId: string     // FK a Category.id
  inStock: boolean       // false → ocultar botón +, mostrar badge "Agotado"
  is_variable_weight: boolean // true → mostrar badge naranja de peso variable
  badge?: string
  currency?: string
  description?: string
  nutritionalInfo?: {
    calories?: number
    protein?: string    // e.g. "3g"
    fat?: string        // e.g. "1.5g"
    carbs?: string      // e.g. "12g"
    fiber?: string      // e.g. "0g"
    serving?: string    // e.g. "Por 100ml"
  }
  availability?: string // "Disponible" | "Pocas unidades" | "Agotado"
}

export interface Category {
  id: string
  name: string
  icon?: string
  slug?: string           // URL-safe: 'lacteos', 'abarrotes'
  illustrationUrl?: string // ruta al SVG de diseño (fallback: icono lucide)
  order?: number          // orden en el grid de Pasillos
}

export interface BusinessCategory {
  id: string
  name: string
  iconName: string        // clave del registro de íconos (UI lo resuelve a LucideIcon)
  slug: string | null     // ruta de navegación; null = no navega
  comingSoon: boolean
}

export interface BusinessCategoryGroup {
  id: string
  label: string           // título de la sección: "Comprar", "Servicios", "Comunidad"
  order: number
  items: BusinessCategory[]
}
