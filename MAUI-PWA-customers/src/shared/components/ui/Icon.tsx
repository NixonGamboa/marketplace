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
      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"
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
