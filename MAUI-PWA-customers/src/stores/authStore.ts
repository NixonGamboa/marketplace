import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'
import { DEMO_USER } from '@/config/app'

const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  /** Inicia sesión con número de WhatsApp. Crea perfil base si es un usuario nuevo. */
  login: (phone: string, name?: string) => Promise<void>
  /** Actualiza campos del perfil del usuario autenticado. */
  updateProfile: (updates: Partial<Pick<User, 'name' | 'avatarUrl' | 'address'>>) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: isDemoMode ? DEMO_USER : null,
      isAuthenticated: isDemoMode,
      loading: false,

      login: async (phone, name) => {
        set({ loading: true })
        // Simula latencia de envío de enlace por WhatsApp
        await new Promise((resolve) => setTimeout(resolve, 700))
        const normalized = phone.replace(/\s+/g, '')
        const user: User = {
          id: `wa-${normalized.replace(/[^\d]/g, '')}`,
          name: name?.trim() || 'Cliente MAUI',
          phone: normalized,
          isAuthenticated: true,
        }
        set({ user, isAuthenticated: true, loading: false })
      },

      updateProfile: (updates) => {
        const current = get().user
        if (!current) return
        set({ user: { ...current, ...updates } })
      },

      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'maui-auth-v1',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
)
