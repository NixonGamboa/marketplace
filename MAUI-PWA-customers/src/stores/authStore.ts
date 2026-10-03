import { create, type StateCreator } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'
import { DEMO_USER } from '@/config/app'
import { isDemoMode } from '@/config/mode'
import { realAuthService } from '@/services/realAuthService'
import type { CustomerSession } from '@/services/real/adapters'
import { queryClient } from '@/shared/queryClient'
import { useCheckoutStore } from '@/features/checkout/checkoutStore'

const demo = isDemoMode()

/** Clave del perfil persistido por el demo; en modo real se elimina: el perfil lo manda el servidor. */
const LEGACY_PROFILE_KEY = 'maui-auth-v1'

/** `restoring`: consulta inicial de la cookie al servidor; `failed`: no se pudo consultar (no es «sin sesión»). */
export type SessionStatus = 'restoring' | 'ready' | 'failed'

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  /** Inicia sesión con número de WhatsApp. Crea perfil base si es un usuario nuevo. */
  login: (phone: string, name?: string) => Promise<void>
  /** Actualiza campos del perfil del usuario autenticado. */
  updateProfile: (updates: Partial<Pick<User, 'name' | 'avatarUrl' | 'address'>>) => void
  logout: () => void

  // ── Modo real: la identidad es la cookie de sesión del servidor ────────────
  sessionStatus: SessionStatus
  /** `true` si la sesión anterior venció (401 o `expiresAt`) y la persona aún no volvió a entrar. */
  sessionExpired: boolean
  /** ISO de vencimiento de la sesión vigente (solo modo real). */
  sessionExpiresAt: string | null
  /** Consulta la sesión al abrir la app; un fallo del servidor deja `sessionStatus: 'failed'`, no «sin sesión». */
  restoreSession: (signal?: AbortSignal) => Promise<void>
  signIn: (phone: string, password: string) => Promise<void>
  signUp: (input: { name: string; phone: string; password: string }) => Promise<void>
  /** Cierra la sesión en el servidor; si no confirma, la sesión local se conserva y el error se propaga. */
  signOut: () => Promise<void>
  /** El servidor rechazó la sesión (401 fuera de `/auth/*`) o llegó `expiresAt`. */
  expireSession: () => void
}

/** Vacía todo lo privado de la cuenta anterior: consultas en caché y el checkout en curso. */
function clearPrivateState(): void {
  queryClient.clear()
  useCheckoutStore.getState().reset()
}

const authCreator: StateCreator<AuthStore> = (set, get) => {
  const applySession = (session: CustomerSession | null) => {
    clearPrivateState()
    set({
      user: session?.user ?? null,
      isAuthenticated: session !== null,
      sessionExpiresAt: session?.expiresAt ?? null,
      sessionExpired: false,
      sessionStatus: 'ready',
    })
  }

  return {
    user: demo ? DEMO_USER : null,
    isAuthenticated: demo,
    loading: false,
    sessionStatus: demo ? 'ready' : 'restoring',
    sessionExpired: false,
    sessionExpiresAt: null,

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

    restoreSession: async (signal) => {
      set({ sessionStatus: 'restoring' })
      let session: CustomerSession | null
      try {
        session = await realAuthService.me(signal ? { signal } : undefined)
      } catch {
        if (!signal?.aborted) set({ sessionStatus: 'failed' })
        return
      }
      // Solo si cambió la identidad se descarta lo privado; recargar la misma cuenta no vacía nada.
      if ((session?.user.id ?? null) !== (get().user?.id ?? null)) clearPrivateState()
      set({
        user: session?.user ?? null,
        isAuthenticated: session !== null,
        sessionExpiresAt: session?.expiresAt ?? null,
        sessionStatus: 'ready',
      })
    },

    signIn: async (phone, password) => {
      set({ loading: true })
      try {
        applySession(await realAuthService.login(phone, password))
      } finally {
        set({ loading: false })
      }
    },

    signUp: async (input) => {
      set({ loading: true })
      try {
        applySession(await realAuthService.register(input))
      } finally {
        set({ loading: false })
      }
    },

    signOut: async () => {
      await realAuthService.logout()
      applySession(null)
    },

    expireSession: () => {
      if (!get().isAuthenticated) return
      clearPrivateState()
      set({ user: null, isAuthenticated: false, sessionExpiresAt: null, sessionExpired: true })
    },
  }
}

if (!demo && typeof localStorage !== 'undefined') {
  // El perfil del demo (identidad ficticia) no debe reaparecer como sesión en modo real.
  try {
    localStorage.removeItem(LEGACY_PROFILE_KEY)
  } catch {
    // sin almacenamiento no hay nada que limpiar
  }
}

export const useAuthStore = demo
  ? create<AuthStore>()(
      persist(authCreator, {
        name: LEGACY_PROFILE_KEY,
        partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      }),
    )
  : create<AuthStore>()(authCreator)
