import { QueryClient } from '@tanstack/react-query'

/** Cliente de consultas único: la sesión lo vacía al cambiar de cuenta para no mezclar datos privados. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      retry: 1,
    },
  },
})
