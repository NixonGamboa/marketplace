import { QueryClient } from '@tanstack/react-query'

/** Cliente de consultas único: la sesión lo vacía al cambiar de cuenta para no mezclar datos privados. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      // Un reintento, y solo con red: sin ella el error se muestra de inmediato y «Reintentar» queda en manos de la persona.
      retry: (failureCount: number) => failureCount < 1 && navigator.onLine !== false,
    },
  },
})
