/**
 * @spec §11, TASK-019 — Gestión de audio para alertas de pedidos nuevos.
 * Requiere gesto de usuario previo (política autoplay de browsers).
 * enableSound() debe llamarse desde un handler de click/tap.
 */

// El flag y la instancia son module-level para sobrevivir re-renders.
// En Strict Mode React puede ejecutar efectos dos veces en dev; la lógica es idempotente.
let audio: HTMLAudioElement | null = null
let enabled = (typeof sessionStorage !== 'undefined')
  ? sessionStorage.getItem('maui-admin-sound-enabled') === '1'
  : false

export function enableSound(): void {
  enabled = true
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('maui-admin-sound-enabled', '1')
  }
  // Crear instancia lazy sólo en el primer gesto de usuario
  if (!audio) {
    audio = new Audio('/sounds/new-order.mp3')
  }
}

export function isSoundEnabled(): boolean {
  return enabled
}

export function playNewOrderSound(): void {
  if (!enabled || !audio) return
  audio.currentTime = 0
  // El catch silencia errores de política de autoplay del browser
  audio.play().catch(() => { /* política del browser ignoró la reproducción */ })
}
