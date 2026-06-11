import { useEffect, useState, useCallback } from 'react'
import { Play, Pause, CheckCircle } from 'lucide-react'
import type { OrderStatus } from '@/types/orderService'
import { orderRepo } from '@/services'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DemoSimulatorProps {
  orderId: string
  currentStatus: OrderStatus
  onStatusChange: (newStatus: OrderStatus) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_INTERVAL_MS = 20_000

const TRANSITIONS: Record<OrderStatus, OrderStatus | null> = {
  received:  'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready:     'delivered',
  delivered: null,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DemoSimulator({
  orderId,
  currentStatus,
  onStatusChange,
}: DemoSimulatorProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(DEMO_INTERVAL_MS / 1000)

  // Stable callback reference so the effect dep array stays clean
  const handleStatusChange = useCallback(onStatusChange, [onStatusChange])

  // Main interval effect
  useEffect(() => {
    if (!isRunning) {
      setSecondsLeft(DEMO_INTERVAL_MS / 1000)
      return
    }

    // Stop immediately when already at the terminal state
    if (currentStatus === 'delivered') {
      setIsRunning(false)
      return
    }

    // Reset countdown on each new status
    setSecondsLeft(DEMO_INTERVAL_MS / 1000)

    const interval = setInterval(() => {
      const next = TRANSITIONS[currentStatus]
      if (!next) {
        setIsRunning(false)
        return
      }
      orderRepo
        .updateStatus(orderId, next, 'demo-simulator')
        .then(() => handleStatusChange(next))
        .catch(() => { /* el siguiente tick reintenta o se detiene en delivered */ })
    }, DEMO_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isRunning, currentStatus, orderId, handleStatusChange])

  // Countdown tick — runs only while the simulator is running
  useEffect(() => {
    if (!isRunning || currentStatus === 'delivered') return

    const tick = setInterval(() => {
      setSecondsLeft((prev) => (prev > 1 ? prev - 1 : DEMO_INTERVAL_MS / 1000))
    }, 1000)

    return () => clearInterval(tick)
  }, [isRunning, currentStatus])

  function handleToggle() {
    if (currentStatus === 'delivered') return
    setIsRunning((prev) => !prev)
  }

  // ---------------------------------------------------------------------------
  // Render: terminal state
  // ---------------------------------------------------------------------------

  if (currentStatus === 'delivered') {
    return (
      <section
        aria-label="Simulador de demo — finalizado"
        className="border-l-4 border-l-purple-500 bg-purple-50 rounded-xl p-4 mb-4"
      >
        <div className="flex items-center gap-2 text-purple-700">
          <CheckCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium">Demo finalizada</span>
        </div>
        <p className="mt-1 text-xs text-purple-600">
          El pedido llegó al estado final: Entregado.
        </p>
      </section>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: interactive state
  // ---------------------------------------------------------------------------

  return (
    <section
      aria-label="Simulador de demo — control de avance automático"
      className="border-l-4 border-l-purple-500 bg-purple-50 rounded-xl p-4 mb-4"
    >
      <p className="text-xs text-purple-700 font-medium mb-3 uppercase tracking-wide">
        Modo demo
      </p>

      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={isRunning}
        aria-label={
          isRunning
            ? 'Detener simulador de demo'
            : 'Iniciar simulador de demo — avanza el estado cada 20 segundos'
        }
        className={[
          'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium',
          'transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'min-h-[44px]', // touch-friendly
          isRunning
            ? 'bg-gray-200 hover:bg-gray-300 text-gray-700 focus-visible:outline-gray-500'
            : 'bg-green-600 hover:bg-green-700 text-white focus-visible:outline-green-600',
        ].join(' ')}
      >
        {isRunning ? (
          <Pause className="w-4 h-4 shrink-0" aria-hidden="true" />
        ) : (
          <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
        )}
        {isRunning ? 'Detener simulador' : 'Demo en vivo'}
      </button>

      <p className="mt-2 text-xs text-purple-600">
        {isRunning
          ? `Avanza al siguiente estado en ${secondsLeft}s`
          : 'Avanza automáticamente cada 20 segundos'}
      </p>
    </section>
  )
}
