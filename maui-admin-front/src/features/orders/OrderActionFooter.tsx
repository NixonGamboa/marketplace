/**
 * ME-03 — Pie del detalle: UNA acción principal por estado; las secundarias (entrega directa, reabrir) van
 * como botones de contorno. Si la principal no está disponible, el motivo se ve en pantalla (no en un tooltip)
 * y, con pendientes, lleva a la fila que falta.
 */
import type { OrderAction } from './orderActions'

export interface PendingNotice {
  /** «Faltan 2: Tomate, Arroz». */
  text: string
  onJump(): void
}

interface OrderActionFooterProps {
  primary: OrderAction | null
  secondary: OrderAction | null
  canReopen: boolean
  busy: boolean
  /** Con pendientes la acción principal queda deshabilitada y se explica por qué. */
  blocked: PendingNotice | null
  onAction(action: OrderAction): void
  onReopen(): void
}

const SECONDARY_CLASS =
  'min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50'

export function OrderActionFooter({ primary, secondary, canReopen, busy, blocked, onAction, onReopen }: OrderActionFooterProps) {
  if (!primary && !secondary && !canReopen) return null
  const disabled = busy || blocked !== null

  return (
    <footer
      role="group"
      aria-label="Acciones del pedido"
      className="sticky bottom-0 z-10 -mx-1 mt-6 rounded-t-2xl border-t border-gray-200 bg-white/95 px-4 pb-4 pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur"
    >
      {blocked && (
        <p className="mb-2 text-sm text-amber-800" id="primary-blocked-reason">
          <button type="button" onClick={blocked.onJump} className="text-left font-medium underline underline-offset-2">
            {blocked.text}
          </button>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {primary && (
          <button
            type="button"
            onClick={() => onAction(primary)}
            disabled={disabled}
            aria-describedby={blocked ? 'primary-blocked-reason' : undefined}
            className="min-h-12 flex-1 rounded-xl bg-indigo-600 px-5 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Guardando…' : primary.label}
          </button>
        )}
        {secondary && (
          <button type="button" onClick={() => onAction(secondary)} disabled={busy} className={SECONDARY_CLASS}>
            {secondary.label}
          </button>
        )}
        {canReopen && (
          <button type="button" onClick={onReopen} disabled={busy} className={SECONDARY_CLASS}>
            Reabrir preparación
          </button>
        )}
      </div>
    </footer>
  )
}
