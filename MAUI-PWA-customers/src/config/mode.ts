/**
 * Modo de ejecución de la PWA. El demo (mocks y datos locales) se activa solo con
 * `VITE_DEMO_MODE=true` (`npm run dev`, `build:demo` y el build unificado hasta T-23); en cualquier
 * otro caso (`npm run dev:real`, builds reales) la app usa la API real y nunca cae a datos locales.
 * Se lee en cada llamada para poder fijarlo en pruebas con `vi.stubEnv`.
 */
export const isDemoMode = (): boolean => import.meta.env.VITE_DEMO_MODE === 'true'
