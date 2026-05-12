import { create } from 'zustand'
import type { User } from '@/types'

interface AuthStore {
  user: User | null
  loading: boolean
  login: (phone: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: false,

  login: async (_phone: string) => {
    set({ loading: true })
    // TODO: integrar con API de autenticación WhatsApp
    set({ loading: false })
  },

  logout: () => set({ user: null }),
}))
