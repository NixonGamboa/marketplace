// Aviso de sesión vencida: el transporte lo emite al recibir un 401 fuera de `/auth/*` y la capa
// de autenticación lo escucha para volver al login sin que cada pantalla gestione la expiración.

type Listener = () => void

const listeners = new Set<Listener>()

export const onSessionExpired = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const notifySessionExpired = (): void => {
  for (const listener of [...listeners]) listener()
}
