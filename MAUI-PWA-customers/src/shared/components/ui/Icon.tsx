/*
Icon de MAUI
─────────────────────────────────────────────
- Wrapper genérico para usar íconos SVG en la app.
- Objetivo: centralizar tamaño, color y accesibilidad de íconos.
- Props:
  - name (identificador del ícono, ej: "cart", "search", "whatsapp").
  - size (sm, md, lg → clases Tailwind).
  - color (por defecto #120f20, acepta variantes: morado #7441d8, blanco #fefefe).
  - className opcional para estilos extra.
- Implementación:
  - Internamente usa un objeto map con los paths SVG.
  - Retorna un <svg> con role="img" y aria-hidden={false/true} según contexto.
- Buenas prácticas:
  - Íconos escalables (width/height = currentSize).
  - Usar strokeWidth y fill coherentes.
  - Soporte para pasar aria-label opcional para accesibilidad.
*/
import { type SVGProps, type ReactElement } from 'react'

type IconName =
  | 'cart'
  | 'search'
  | 'whatsapp'
  | 'menu'
  | 'close'
  | 'chevron-right'
  | 'chevron-left'
  | 'category'
  | 'spinner'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: 'sm' | 'md' | 'lg' | number
  colorClass?: string
  decorative?: boolean
}

const SIZE_MAP: Record<NonNullable<IconProps['size']>, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  0: '', // placeholder, not used
}

const paths: Record<IconName, ReactElement> = {
  cart: (
    <path
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.5 3.5h1.8l1.5 9.2a1 1 0 0 0 1 .8h6.9a1 1 0 0 0 1-.8l1.1-5.8H6.2M17 18.2a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0Zm-7.2 0a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0Z"
    />
  ),
  search: (
    <path
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.5 15.5 20 20m-2.7-8.7a6.7 6.7 0 1 1-13.4 0 6.7 6.7 0 0 1 13.4 0Z"
    />
  ),
  whatsapp: (
    <path
      fill="currentColor"
      d="M9.95 2C5.55 2 2 5.54 2 9.93c0 1.74.56 3.35 1.5 4.67L2 22l7.6-1.48a7.92 7.92 0 0 0 3.36.74c4.39 0 7.95-3.55 7.95-7.93C20.9 5.54 17.34 2 12.95 2h-3Zm.05 1.8h3c3.41 0 6.1 2.69 6.1 6.13 0 3.42-2.69 6.12-6.1 6.12a6.1 6.1 0 0 1-2.9-.74l-.6-.34-4.5.87.86-4.38-.37-.63a6.13 6.13 0 0 1-.96-3.24c0-3.44 2.7-6.13 6.1-6.13Zm-2.4 2.9-.27.01c-.23.01-.5.07-.76.37-.26.3-1 1-.97 2.43.03 1.43 1.03 2.82 1.17 3 .15.18 2.02 3.22 5.2 4.38 2.56.94 3.08.86 3.63.8.55-.07 1.78-.72 2.03-1.43.25-.72.25-1.34.18-1.47-.07-.13-.27-.2-.57-.34-.3-.15-1.78-.86-2.05-.96-.27-.1-.47-.15-.66.15-.2.3-.78.96-.95 1.15-.17.19-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.46-.89-.78-1.5-1.74-1.68-2.04-.17-.3-.02-.47.13-.62.13-.13.3-.34.46-.5.15-.17.2-.29.3-.49.1-.19.05-.37 0-.5-.06-.14-.53-1.3-.73-1.78-.18-.42-.37-.43-.57-.44Z"
    />
  ),
  menu: (
    <path
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      d="M3 6h14M3 12h14M3 18h14"
    />
  ),
  close: (
    <path stroke="currentColor" strokeWidth={2} strokeLinecap="round" d="m5 5 12 12M17 5 5 17" />
  ),
  'chevron-right': (
    <path stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="m8 4 6 6-6 6" />
  ),
  'chevron-left': (
    <path stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="m14 4-6 6 6 6" />
  ),
  category: (
    <path
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.5 4.5h5v5h-5v-5Zm0 9h5v5h-5v-5Zm9-9h5v5h-5v-5Zm5 9h-5v5h5v-5Z"
    />
  ),
  spinner: (
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
  ),
}

const Icon = ({
  name,
  size = 'md',
  colorClass = 'text-brand-dark',
  decorative = false,
  className = '',
  ...rest
}: IconProps) => {
  const isNumber = typeof size === 'number'
  const sizeClasses = isNumber ? '' : SIZE_MAP[size]
  const pixel = isNumber ? size : undefined
  const ariaHidden = decorative && !rest['aria-label']
  return (
    <svg
      role={ariaHidden ? undefined : 'img'}
      aria-hidden={ariaHidden || undefined}
      viewBox="0 0 24 24"
      width={pixel}
      height={pixel}
      className={[sizeClasses, colorClass, 'shrink-0', className].join(' ')}
      fill="none"
      {...rest}
    >
      {paths[name]}
    </svg>
  )
}

export type { IconProps, IconName }
export default Icon
