/*
  OrderTimeline
  ─────────────────────────────────────────────
  Stepper vertical de 5 estados para el seguimiento de un pedido MAUI.
  - Completados:  icono verde brand-primary, check overlay, línea coloreada.
  - Activo:       icono con animación pulse, línea coloreada hasta él.
  - Futuros:      icono y línea en gray-300 (atenuados).
  - Accesibilidad: role="list", aria-current="step" en el paso activo.
  - Contraste:    brand-primary (#4338CA) sobre blanco = 7.7:1 ✓
                  brand-dark  (#0F172A) sobre blanco = 18.8:1 ✓
*/

import { Inbox, CheckCircle, Package, Truck, Home, Check } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'received'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'

export interface OrderTimelineProps {
  currentStatus: OrderStatus
  timestamps?: Partial<Record<OrderStatus, string>> // ISO strings, opcionales
}

// ── Step config ───────────────────────────────────────────────────────────────

interface StepConfig {
  key: OrderStatus
  label: string
  Icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
}

const STEPS: StepConfig[] = [
  { key: 'received',  label: 'Recibido',   Icon: Inbox        },
  { key: 'confirmed', label: 'Confirmado', Icon: CheckCircle  },
  { key: 'preparing', label: 'Preparando', Icon: Package      },
  { key: 'ready',     label: 'Listo',      Icon: Truck        },
  { key: 'delivered', label: 'Entregado',  Icon: Home         },
]

const STATUS_ORDER: OrderStatus[] = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStepState(
  stepKey: OrderStatus,
  currentStatus: OrderStatus,
): 'completed' | 'active' | 'future' {
  const stepIdx    = STATUS_ORDER.indexOf(stepKey)
  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  if (stepIdx < currentIdx) return 'completed'
  if (stepIdx === currentIdx) return 'active'
  return 'future'
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day:    '2-digit',
      month:  'short',
      hour:   '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrderTimeline({
  currentStatus,
  timestamps = {},
}: OrderTimelineProps) {
  return (
    <ol
      role="list"
      aria-label="Estado del pedido"
      className="flex flex-col gap-0"
    >
      {STEPS.map((step, idx) => {
        const state      = getStepState(step.key, currentStatus)
        const isLast     = idx === STEPS.length - 1
        const timestamp  = timestamps[step.key]
        const { Icon }   = step

        // ── Derived style tokens ────────────────────────────────────────────
        // Icon container
        const iconContainerClass =
          state === 'completed'
            ? 'bg-brand-primary text-white shadow-brand-sm'
            : state === 'active'
              ? 'bg-brand-primary text-white shadow-brand-md ring-4 ring-brand-primary/20'
              : 'bg-gray-100 text-gray-300 border border-gray-200'

        // Connector line (drawn below icon, except for last step)
        const lineClass =
          state === 'completed' || state === 'active'
            ? 'bg-brand-primary'
            : 'bg-gray-200'

        // Label
        const labelClass =
          state === 'future' ? 'text-gray-400' : 'text-brand-dark'

        // Sub-label (status word)
        const statusLabelClass =
          state === 'completed'
            ? 'text-brand-primary font-medium'
            : state === 'active'
              ? 'text-brand-primary font-semibold'
              : 'text-gray-400'

        const statusWord =
          state === 'completed'
            ? 'Completado'
            : state === 'active'
              ? 'En curso'
              : 'Pendiente'

        return (
          <li
            key={step.key}
            aria-current={state === 'active' ? 'step' : undefined}
            className="flex gap-4"
          >
            {/* Left column: icon + connector */}
            <div className="flex flex-col items-center">
              {/* Icon bubble */}
              <div
                className={[
                  'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300',
                  iconContainerClass,
                ].join(' ')}
              >
                {state === 'completed' ? (
                  /* Completed: show check instead of step icon */
                  <Check size={20} aria-hidden />
                ) : (
                  <Icon
                    size={20}
                    aria-hidden
                    className={[
                      state === 'active'
                        ? 'animate-pulse'
                        : '',
                    ].join(' ')}
                  />
                )}
              </div>

              {/* Vertical connector line (hidden on last step) */}
              {!isLast && (
                <div
                  className={[
                    'mt-1 w-0.5 flex-1 min-h-[2rem] transition-colors duration-300',
                    lineClass,
                  ].join(' ')}
                  aria-hidden
                />
              )}
            </div>

            {/* Right column: text content */}
            <div className={['pb-6 pt-1.5', isLast ? 'pb-0' : ''].join(' ')}>
              <p className={['text-sm font-semibold leading-tight', labelClass].join(' ')}>
                {step.label}
              </p>
              <p className={['text-xs leading-snug mt-0.5', statusLabelClass].join(' ')}>
                {statusWord}
              </p>
              {timestamp && (
                <p className="mt-1 text-xs text-brand-muted">
                  {formatTimestamp(timestamp)}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
