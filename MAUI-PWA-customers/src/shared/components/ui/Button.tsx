import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type ButtonSize = 'sm' | 'md' | 'lg'
type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant
  size?: ButtonSize
  iconLeft?: ReactNode
  iconRight?: ReactNode
  'aria-label'?: string
  fullWidth?: boolean
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-primary text-white shadow-sm hover:bg-brand-primary-dark active:scale-[0.98] disabled:bg-brand-primary/40 disabled:shadow-none focus-visible:ring-brand-primary',
  secondary:
    'bg-white text-brand-primary border border-brand-primary hover:bg-brand-primary-light active:scale-[0.98] disabled:opacity-50 focus-visible:ring-brand-primary',
  ghost:
    'bg-transparent text-brand-muted hover:bg-brand-border/60 hover:text-brand-dark active:scale-[0.98] disabled:opacity-40 focus-visible:ring-brand-primary/50',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-sm px-3 py-1.5 rounded-lg',
  md: 'text-sm px-4 py-2 rounded-xl',
  lg: 'text-base px-6 py-3 rounded-xl font-semibold',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      iconLeft,
      iconRight,
      className = '',
      fullWidth,
      loading = false,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const onlyIcon = !children && (iconLeft || iconRight)
    const base = [
      'inline-flex items-center justify-center gap-2 font-medium transition-all whitespace-nowrap select-none',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface',
      'disabled:cursor-not-allowed',
      variantClasses[variant],
      sizeClasses[size],
      fullWidth ? 'w-full' : '',
      onlyIcon ? 'aspect-square p-2' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button
        ref={ref}
        role="button"
        disabled={disabled || loading}
        className={base}
        {...rest}
      >
        {loading && (
          <span
            className="inline-block size-4 animate-spin rounded-full border-2 border-white/50 border-t-transparent"
            aria-hidden="true"
          />
        )}
        {iconLeft && <span className="flex items-center" aria-hidden={!!children}>{iconLeft}</span>}
        {children && <span className="truncate">{children}</span>}
        {iconRight && <span className="flex items-center" aria-hidden={!!children}>{iconRight}</span>}
      </button>
    )
  },
)

Button.displayName = 'Button'

export type { ButtonProps }
export default Button
