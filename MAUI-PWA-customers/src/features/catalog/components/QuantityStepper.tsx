import { useRef } from 'react'
import { Minus, Plus } from 'lucide-react'

interface QuantityStepperProps {
  quantity: number
  onIncrement: () => void
  onDecrement: () => void
  disabled?: boolean
}

export function QuantityStepper({
  quantity,
  onIncrement,
  onDecrement,
  disabled = false,
}: QuantityStepperProps) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current)
      holdIntervalRef.current = null
    }
  }

  const startHold = (action: () => void) => {
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(action, 300)
    }, 1000)
  }

  return (
    <div
      role="group"
      aria-label={`Cantidad: ${quantity}`}
      className={[
        'flex items-center bg-brand-primary rounded-full shadow-brand-md h-9 px-1 gap-0.5',
        disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Botón decrementar */}
      <button
        type="button"
        aria-label="Disminuir cantidad"
        style={{ touchAction: 'manipulation' }}
        className="w-7 h-7 rounded-full flex items-center justify-center text-white hover:bg-white/15 active:bg-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        onClick={onDecrement}
        onPointerDown={() => startHold(onDecrement)}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
      >
        <Minus size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {/* Cantidad */}
      <span className="min-w-[20px] text-center text-white font-bold text-sm tabular-nums select-none">
        {quantity}
      </span>

      {/* Botón incrementar */}
      <button
        type="button"
        aria-label="Aumentar cantidad"
        style={{ touchAction: 'manipulation' }}
        className="w-7 h-7 rounded-full flex items-center justify-center text-white hover:bg-white/15 active:bg-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        onClick={onIncrement}
        onPointerDown={() => startHold(onIncrement)}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
      >
        <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  )
}
