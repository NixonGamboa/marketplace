import { useState } from 'react'
import { ChevronDown, Phone, RefreshCw, Sparkles, X, Shield } from 'lucide-react'
import type { SubstitutionPref } from '../../types/orderService'
import { useCheckoutStore } from './checkoutStore'

// ─── Option config ────────────────────────────────────────────────────────────

interface SubstitutionOption {
  value: SubstitutionPref
  label: string
  description: string
  Icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
}

// IMPORTANTE: los `value` envían el payload al servicio (similar | call_me | remove).
// Solo cambian copy y estética; no tocar los valores del enum.
const OPTIONS: SubstitutionOption[] = [
  {
    value: 'similar',
    label: 'Elegir la mejor opción disponible',
    description: 'Te enviamos el producto más parecido y de mejor calidad.',
    Icon: RefreshCw,
  },
  {
    value: 'call_me',
    label: 'Avisarme antes de cambiar',
    description: 'Te llamamos para que decidas qué prefieres.',
    Icon: Phone,
  },
  {
    value: 'remove',
    label: 'Quitar el producto',
    description: 'Lo retiramos del pedido sin reemplazo.',
    Icon: X,
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function SubstitutionSelector() {
  const substitutionPref    = useCheckoutStore((s) => s.substitutionPref)
  const setSubstitutionPref = useCheckoutStore((s) => s.setSubstitutionPref)

  const [expanded, setExpanded] = useState(false)

  const selected = OPTIONS.find((o) => o.value === substitutionPref) ?? OPTIONS[0]
  const SelectedIcon = selected.Icon

  const headingId = 'substitution-heading'

  function handlePick(value: SubstitutionPref) {
    setSubstitutionPref(value)
    setExpanded(false)
  }

  return (
    <div className="space-y-4">
      {/* ── Sección encapsulada: header + opciones ──────────────────────────── */}
      <div className="rounded-2xl border border-brand-border bg-white p-5 shadow-card space-y-4">
        {/* Header con tono cálido */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary/10"
          >
            <Sparkles size={18} className="text-brand-primary" />
          </span>
          <div className="flex flex-col leading-tight">
            <span
              id={headingId}
              className="text-[15px] sm:text-base font-semibold text-brand-dark"
            >
              Si necesitamos hacer un cambio
            </span>
            <span className="text-xs text-brand-muted mt-0.5">
              Elegimos siempre la mejor opción para ti.
            </span>
          </div>
        </div>

        {/* ── Vista colapsada: opción actual + chevron ─────────────────────── */}
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            aria-controls="substitution-options"
            className={[
              'w-full flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer transition-colors text-left',
              'focus-visible:outline-none focus-visible:bg-brand-primary/10',
              'bg-white hover:bg-gray-50',
            ].join(' ')}
          >
            {/* Radio visual seleccionado */}
            <span
              aria-hidden="true"
              className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-brand-primary bg-white flex items-center justify-center"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
            </span>

            {/* Icon container */}
            <span
              aria-hidden="true"
              className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary/10"
            >
              <SelectedIcon size={18} className="text-brand-primary" />
            </span>

            {/* Text */}
            <span className="flex-1 min-w-0 flex flex-col leading-tight">
              <span className="text-[13px] font-semibold text-brand-primary">
                {selected.label}
              </span>
              <span className="mt-0.5 text-[11px] text-brand-muted leading-snug">
                {selected.description}
              </span>
            </span>

            {/* Chevron + "Cambiar" hint */}
            <span className="flex flex-col items-center gap-0.5 text-brand-primary flex-shrink-0">
              <span className="text-[10px] font-medium">Cambiar</span>
              <ChevronDown size={16} aria-hidden="true" />
            </span>
          </button>
        )}

        {/* ── Vista expandida: las 3 opciones en lista única ───────────────── */}
        {expanded && (
          <div
            id="substitution-options"
            role="radiogroup"
            aria-labelledby={headingId}
            className="animate-slide-in-top overflow-hidden"
          >
            {OPTIONS.map(({ value, label, description, Icon }, idx) => {
              const isSelected = substitutionPref === value
              const inputId    = `substitution-${value}`
              const isLast     = idx === OPTIONS.length - 1

              return (
                <div key={value}>
                  <label
                    htmlFor={inputId}
                    className={[
                      'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                      'bg-white hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      id={inputId}
                      name="substitution-preference"
                      value={value}
                      checked={isSelected}
                      onChange={() => handlePick(value)}
                      className="sr-only"
                    />

                    {/* Radio visual */}
                    <span
                      aria-hidden="true"
                      className={[
                        'flex-shrink-0 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center transition-colors',
                        isSelected ? 'border-brand-primary' : 'border-gray-300',
                      ].join(' ')}
                    >
                      {isSelected && (
                        <span className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
                      )}
                    </span>

                    {/* Icon container */}
                    <span
                      aria-hidden="true"
                      className={[
                        'flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                        isSelected ? 'bg-brand-primary/10' : 'bg-gray-100',
                      ].join(' ')}
                    >
                      <Icon
                        size={18}
                        aria-hidden={true}
                        className={isSelected ? 'text-brand-primary' : 'text-gray-500'}
                      />
                    </span>

                    {/* Text */}
                    <span className="flex-1 min-w-0 flex flex-col leading-tight">
                      <span
                        className={[
                          'text-[13px] font-semibold',
                          isSelected ? 'text-brand-primary' : 'text-brand-dark',
                        ].join(' ')}
                      >
                        {label}
                      </span>
                      <span className="mt-0.5 text-[11px] text-brand-muted leading-snug">
                        {description}
                      </span>
                    </span>
                  </label>
                  {!isLast && (
                    <div aria-hidden="true" className="mx-4 h-px bg-brand-border" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Señal de confianza (card separada) ──────────────────────────────── */}
      <div className="flex items-center gap-3 rounded-2xl border border-brand-border bg-white px-4 py-3 shadow-card">
        <span
          aria-hidden="true"
          className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10"
        >
          <Shield size={18} className="text-brand-primary" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-brand-dark">
            Te avisaremos por WhatsApp
          </span>
          <span className="text-xs text-brand-muted mt-0.5">
            Cualquier novedad sobre tu pedido.
          </span>
        </div>
      </div>
    </div>
  )
}
