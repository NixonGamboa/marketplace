import { useState } from 'react'
import { Volume2 } from 'lucide-react'
import { disableSound, enableSound, isSoundEnabled } from '@/lib/audio'

/** Activación y desactivación explícitas; la reproducción requiere el gesto del usuario. */
export function EnableSoundGate() {
  const [enabled, setEnabled] = useState(isSoundEnabled)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  async function toggle() {
    setPending(true)
    setError(false)
    try {
      if (enabled) disableSound()
      else await enableSound()
      setEnabled(!enabled)
    } catch { setError(true) }
    finally { setPending(false) }
  }
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-5 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <Volume2 className="w-4 h-4 shrink-0" aria-hidden />
        <span>Sonido para pedidos nuevos</span>
        {error && <span role="status">No se pudo activar el sonido; las alertas visuales siguen disponibles.</span>}
      </div>
      <button type="button" aria-pressed={enabled} disabled={pending} onClick={() => void toggle()}
        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold">
        {enabled ? 'Desactivar sonido' : 'Activar sonido'}
      </button>
    </div>
  )
}
