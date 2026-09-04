/**
 * @spec §11, TASK-019 — Banner "Activar sonido para pedidos nuevos".
 * Se muestra una vez por sesión hasta que el usuario hace click.
 * Después del click llama enableSound() y se descarta permanentemente
 * para la sesión (sessionStorage['maui-admin-sound-enabled']).
 * Strict Mode safe: la inicialización lee sessionStorage directamente.
 */
import { useState } from 'react'
import { Volume2, X } from 'lucide-react'
import { enableSound, isSoundEnabled } from '@/lib/audio'

export function EnableSoundGate() {
  const [dismissed, setDismissed] = useState(() => isSoundEnabled())

  if (dismissed) return null

  function handleEnable() {
    enableSound()
    setDismissed(true)
  }

  function handleDismiss() {
    // Descarta el banner sin habilitar sonido. No persiste en sessionStorage
    // para que el gesto explícito de habilitación sea el único camino.
    setDismissed(true)
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-5 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <Volume2 className="w-4 h-4 shrink-0" aria-hidden />
        <span>Activa el sonido para recibir alertas de pedidos nuevos</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleEnable}
          className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition"
        >
          Activar
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Cerrar aviso de sonido"
          className="text-amber-600 hover:text-amber-800 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
