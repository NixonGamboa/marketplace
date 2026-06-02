import { Phone, RefreshCw, X } from 'lucide-react'
import type { SubstitutionPref } from '../../types/orderService'
import { useCheckoutStore } from './checkoutStore'

// ─── Option config ────────────────────────────────────────────────────────────

interface SubstitutionOption {
  value: SubstitutionPref
  label: string
  Icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
}

const OPTIONS: SubstitutionOption[] = [
  { value: 'call_me', label: 'Llámame antes de cambiarlo',  Icon: Phone      },
  { value: 'similar', label: 'Cámbialo por uno similar',    Icon: RefreshCw  },
  { value: 'remove',  label: 'Quítalo de mi pedido',         Icon: X          },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function SubstitutionSelector() {
  const substitutionPref   = useCheckoutStore((s) => s.substitutionPref)
  const setSubstitutionPref = useCheckoutStore((s) => s.setSubstitutionPref)

  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="text-base font-semibold text-brand-dark mb-3 w-full">
        Si algún producto no está disponible...
      </legend>

      <div className="flex flex-col gap-3">
        {OPTIONS.map(({ value, label, Icon }) => {
          const isSelected = substitutionPref === value
          const inputId    = `substitution-${value}`

          return (
            <label
              key={value}
              htmlFor={inputId}
              className={[
                'flex items-center gap-3 min-h-14 px-4 py-3 rounded-xl cursor-pointer',
                'bg-brand-surface border-2 transition-colors duration-150',
                'hover:border-brand-primary hover:bg-brand-primary/5',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-primary has-[:focus-visible]:ring-offset-2',
                isSelected
                  ? 'border-brand-primary bg-brand-primary/10'
                  : 'border-brand-border',
              ].join(' ')}
            >
              {/* Hidden native radio — retains full keyboard + AT support */}
              <input
                type="radio"
                id={inputId}
                name="substitution-preference"
                value={value}
                checked={isSelected}
                onChange={() => setSubstitutionPref(value)}
                className="sr-only"
              />

              {/* Custom visual indicator */}
              <span
                aria-hidden="true"
                className={[
                  'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center',
                  isSelected
                    ? 'border-brand-primary bg-brand-primary'
                    : 'border-brand-border bg-brand-surface',
                ].join(' ')}
              >
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-white" />
                )}
              </span>

              {/* Icon */}
              <Icon
                size={20}
                aria-hidden={true}
                className={isSelected ? 'text-brand-primary flex-shrink-0' : 'text-brand-muted flex-shrink-0'}
              />

              {/* Label text */}
              <span
                className={[
                  'text-sm leading-snug',
                  isSelected ? 'font-semibold text-brand-dark' : 'font-normal text-brand-dark',
                ].join(' ')}
              >
                {label}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
