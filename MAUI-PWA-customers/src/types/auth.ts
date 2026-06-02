export interface User {
  id: string
  name: string
  phone: string
  isAuthenticated: boolean
}

export interface AuthState {
  user: User | null
  loading: boolean
}
