/*
Button de MAUI
─────────────────────────────────────────────
- Componente genérico reutilizable.
- Variantes:
  - primario: fondo morado (#7441d8), texto blanco.
  - secundario: fondo blanco, borde morado, texto morado.
- Props:
  - tamaño (sm, md, lg).
  - iconLeft, iconRight (íconos opcionales).
  - disabled.
- Accesibilidad: role="button", aria-label opcional.
- Estilos: clases Tailwind, focus:ring para accesibilidad.
*/
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

// Tipos de tamaño permitidos
type ButtonSize = 'sm' | 'md' | 'lg'
// Variantes visuales
type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant
  size?: ButtonSize
  iconLeft?: ReactNode
  iconRight?: ReactNode
  /** Etiqueta accesible si el botón solo tiene ícono */
  'aria-label'?: string
  /** Forzar ancho completo */
  fullWidth?: boolean
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-primary text-white hover:bg-brand-primary/90 disabled:bg-brand-primary/50 focus-visible:ring-brand-primary',
  secondary:
    'bg-white text-brand-primary border border-brand-primary hover:bg-brand-primary/5 disabled:opacity-60 focus-visible:ring-brand-primary',
  ghost:
    'bg-transparent text-brand-dark hover:bg-brand-border/30 disabled:opacity-50 focus-visible:ring-brand-primary/50',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-sm px-3 py-1.5 rounded-md',
  md: 'text-sm px-4 py-2 rounded-lg',
  lg: 'text-base px-5 py-2.5 rounded-xl',
}

/**
 * Button reutilizable siguiendo la identidad visual de MAUI.
 * - Usa variantes y tamaños predefinidos.
 * - Admite íconos a izquierda y derecha.
 * - Accesible con focus ring y aria-label cuando solo hay ícono.
 */
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
      'inline-flex items-center justify-center gap-2 font-medium transition-colors whitespace-nowrap select-none',
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
            className="inline-block size-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent"
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
