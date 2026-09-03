/**
 * @spec §8 — Indicador de carga usando Loader2 de lucide-react con animate-spin.
 */
import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: number
  className?: string
  label?: string
}

export function Spinner({ size = 20, className = '', label = 'Cargando...' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={className}>
      <Loader2 size={size} className="animate-spin text-indigo-600" aria-hidden />
    </span>
  )
}
