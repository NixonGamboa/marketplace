import { create } from 'zustand'
import type { User } from '@/types'

const DEMO_USER: User = {
  id: 'demo-user-001',
  name: 'Usuario Demo',
  phone: '+573001234567',
  isAuthenticated: true,
}

const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  login: (phone: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: isDemoMode ? DEMO_USER : null,
  isAuthenticated: isDemoMode,
  loading: false,

  login: async (_phone: string) => {
    set({ loading: true })
    // TODO: integrar con API de autenticación WhatsApp
    set({ loading: false })
  },

  logout: () => set({ user: null, isAuthenticated: false }),
}))
