/*
Input de MAUI
─────────────────────────────────────────────
- Input genérico reutilizable.
- Estilos:
  - Borde gris claro, borde morado en focus.
  - Texto #120f20, placeholder gris.
  - Padding uniforme (px-3 py-2).
- Props:
  - type (text, email, password, number).
  - label opcional (asociado con id para accesibilidad).
- Accesibilidad: aria-label o <label for>.
*/
import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  hint?: string
  fullWidth?: boolean
}

/**
 * Input reutilizable con soporte para label, hint y mensaje de error.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ id, label, error, hint, className = '', fullWidth, type = 'text', ...rest }, ref) => {
    const inputId = id || rest.name || undefined
    return (
      <div className={['space-y-1', fullWidth ? 'w-full' : '', 'text-[13px]'].join(' ')}>
        {label && (
          <label
            htmlFor={inputId}
            className="block font-medium text-brand-dark/90 select-none"
          >
            {label}
          </label>
        )}
        <input
            id={inputId}
            ref={ref}
            type={type}
            className={[
              'peer block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-gray-400 outline-none transition',
              'focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/40',
              'disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500',
              error ? 'border-red-500 focus:border-red-500 focus:ring-red-400/40' : '',
              fullWidth ? 'w-full' : '',
              className,
            ].join(' ')}
            aria-invalid={!!error || undefined}
            aria-describedby={hint ? `${inputId}-hint` : undefined}
            {...rest}
        />
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-gray-500 text-[12px]">
            {hint}
          </p>
        )}
        {error && (
          <p className="text-[12px] text-red-600 font-medium" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

export type { InputProps }
export default Input
