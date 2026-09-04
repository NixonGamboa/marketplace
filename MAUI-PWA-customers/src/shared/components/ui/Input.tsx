import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  hint?: string
  fullWidth?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ id, label, error, hint, className = '', fullWidth, type = 'text', ...rest }, ref) => {
    const inputId = id || rest.name || undefined
    return (
      <div className={['space-y-1.5', fullWidth ? 'w-full' : '', 'text-[13px]'].join(' ')}>
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
            'peer block rounded-xl border border-brand-border bg-white px-4 py-2.5 text-sm text-brand-dark',
            'placeholder:text-brand-muted/70 outline-none transition-all',
            'hover:border-brand-primary/50',
            'focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:shadow-brand-sm',
            'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
            error ? 'border-brand-error focus:border-brand-error focus:ring-brand-error/20' : '',
            fullWidth ? 'w-full' : '',
            className,
          ].join(' ')}
          aria-invalid={!!error || undefined}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-brand-muted text-[12px]">
            {hint}
          </p>
        )}
        {error && (
          <p className="text-[12px] text-brand-error font-medium" role="alert">
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
