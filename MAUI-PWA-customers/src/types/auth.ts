export interface User {
  id: string
  name: string
  phone: string
  isAuthenticated: boolean
  /** URL opcional de avatar — si no existe se muestra fallback con iniciales */
  avatarUrl?: string
  /** Dirección de entrega principal del usuario */
  address?: string
}

export interface AuthState {
  user: User | null
  loading: boolean
}
