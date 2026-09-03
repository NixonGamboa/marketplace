// Seed del directorio de usuarios admin — idempotente vía marker.
//
// Las credenciales reales viven en `VITE_ADMIN_USERS` (env) con fallback en
// `mockAuthRepository`. Este seed sólo registra el marker para dejar evidencia
// en `localStorage` de que el bootstrap de usuarios fue ejecutado en este
// dispositivo (paridad con catalog/merchant/store) — no persiste credenciales
// por seguridad: nunca escribimos contraseñas en `localStorage`.

const SEED_MARKER = 'maui-admin-users-seeded-v1'

export function runUsersSeed(): void {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(SEED_MARKER) === '1') return
  window.localStorage.setItem(SEED_MARKER, '1')
}
