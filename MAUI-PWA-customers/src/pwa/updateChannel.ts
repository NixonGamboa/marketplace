// Canal entre el registro del service worker (main.tsx) y el aviso de actualización: el banner no
// importa el módulo virtual de vite-plugin-pwa, así sus pruebas no necesitan un worker.

let applyUpdate: (() => Promise<void>) | null = null

export const setUpdateHandler = (handler: () => Promise<void>): void => {
  applyUpdate = handler
}

/** Activa el worker en espera y recarga; sin worker registrado (demo en dev, sin soporte) solo recarga. */
export const applyServiceWorkerUpdate = async (): Promise<void> => {
  if (applyUpdate) await applyUpdate()
  else window.location.reload()
}
