/*
Carousel genérico de MAUI
─────────────────────────────────────────────
- Reutilizable en HeroCarousel y MostOrderedSection.
- Props:
  - items (array de elementos).
  - mostrar cantidad visible (desktop vs móvil).
  - autoplay opcional.
- Estilos:
  - Scroll horizontal suave (snap-x).
  - Controles prev/next con botones accesibles.
- Accesibilidad: aria-roledescription="carousel", aria-labels para controles.
*/
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Button from './Button'
import Icon from './Icon'

export interface VisibleConfig {
  base: number
  sm?: number
  md?: number
  lg?: number
  xl?: number
}

interface CarouselProps {
  /** Elementos a renderizar. Alternativamente usar children. */
  items?: ReactNode[]
  /** Si se usan children, cada child será tratado como slide. */
  children?: ReactNode
  /** Cantidad visible por breakpoint (1-6). */
  visible?: VisibleConfig
  /** Inicia en este índice (no-controlado). */
  defaultIndex?: number
  /** Controlado externamente. */
  index?: number
  /** Callback cuando cambia el índice. */
  onIndexChange?: (idx: number) => void
  /** Habilita autoplay. */
  autoplay?: boolean
  /** Intervalo ms para autoplay. */
  interval?: number
  /** Loop al llegar al final. */
  loop?: boolean
  /** Muestra indicadores inferiores (dots). */
  indicators?: boolean
  /** Oculta controles prev/next. */
  hideControls?: boolean
  /** Breakpoint Tailwind a partir del cual se muestran controles (ej: 'md'). */
  controlsBreakpoint?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  /** Etiqueta accesible general */
  ariaLabel?: string
  className?: string
}

const widthClass = (n?: number): string => {
  switch (n) {
    case 1:
      return 'basis-full'
    case 2:
      return 'basis-1/2'
    case 3:
      return 'basis-1/3'
    case 4:
      return 'basis-1/4'
    case 5:
      return 'basis-1/5'
    case 6:
      return 'basis-1/6'
    default:
      return 'basis-full'
  }
}

/**
 * Carousel accesible y reutilizable.
 * - Usa scroll + snap para suavidad nativa.
 * - Prev/Next controlan índice y hacen scroll al slide.
 * - Autoplay opcional (pausa en hover / focus).
 */
const Carousel = ({
  items,
  children,
  visible = { base: 1, md: 3 },
  defaultIndex = 0,
  index,
  onIndexChange,
  autoplay = false,
  interval = 5000,
  loop = true,
  indicators = true,
  hideControls = false,
  controlsBreakpoint = 'md',
  ariaLabel = 'Carrusel',
  className = '',
}: CarouselProps) => {
  const slides: ReactNode[] = items ?? (Array.isArray(children) ? children : [children]).filter(Boolean)
  const count = slides.length
  const isControlled = index !== undefined
  const [internalIndex, setInternalIndex] = useState(defaultIndex)
  const activeIndex = isControlled ? index! : internalIndex
  const containerRef = useRef<HTMLDivElement | null>(null)
  const id = useId()
  const pausedRef = useRef(false)

  const setIndex = useCallback(
    (next: number) => {
      if (!count) return
      let target = next
      if (loop) {
        if (target < 0) target = count - 1
        else if (target >= count) target = 0
      } else {
        target = Math.max(0, Math.min(count - 1, target))
      }
      if (!isControlled) setInternalIndex(target)
      onIndexChange?.(target)
    },
    [count, loop, isControlled, onIndexChange],
  )

  const scrollToActive = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const child = el.children[activeIndex] as HTMLElement | undefined
    if (child) child.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }, [activeIndex])

  useEffect(() => {
    scrollToActive()
  }, [activeIndex, scrollToActive])

  useEffect(() => {
    if (!autoplay || count <= 1) return
    const timer = setInterval(() => {
      if (!pausedRef.current) setIndex(activeIndex + 1)
    }, interval)
    return () => clearInterval(timer)
  }, [autoplay, interval, activeIndex, setIndex, count])

  const onPrev = () => setIndex(activeIndex - 1)
  const onNext = () => setIndex(activeIndex + 1)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      onNext()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onPrev()
    }
  }

  const widthClasses = [
    widthClass(visible.base),
    visible.sm && `sm:${widthClass(visible.sm)}`,
    visible.md && `md:${widthClass(visible.md)}`,
    visible.lg && `lg:${widthClass(visible.lg)}`,
    visible.xl && `xl:${widthClass(visible.xl)}`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={['relative', className].join(' ')}
      aria-roledescription="carousel"
      role="group"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      onFocus={() => (pausedRef.current = true)}
      onBlur={() => (pausedRef.current = false)}
    >
      <div
        ref={containerRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mb-2 no-scrollbar"
        tabIndex={0}
        aria-label={`Slides (${count})`}
      >
        {slides.map((slide, i) => (
          <div
            key={`${id}-${i}`}
            className={[
              'flex-none snap-start focus:outline-none outline-none',
              widthClasses,
              i === activeIndex ? 'opacity-100' : 'opacity-100 md:opacity-95',
              'transition-opacity',
            ].join(' ')}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} de ${count}`}
          >
            {slide}
          </div>
        ))}
      </div>

      {!hideControls && count > 1 && (
        <>
          <div
            className={[
              'pointer-events-none absolute inset-y-0 left-0 items-center pl-1 hidden',
              `${controlsBreakpoint}:flex`,
            ].join(' ')}
          >
            <Button
              variant="secondary"
              size="sm"
              aria-label="Anterior"
              onClick={onPrev}
              className="pointer-events-auto rounded-full shadow-sm"
            >
              <Icon name="chevron-left" decorative />
            </Button>
          </div>
          <div
            className={[
              'pointer-events-none absolute inset-y-0 right-0 items-center pr-1 hidden',
              `${controlsBreakpoint}:flex`,
            ].join(' ')}
          >
            <Button
              variant="secondary"
              size="sm"
              aria-label="Siguiente"
              onClick={onNext}
              className="pointer-events-auto rounded-full shadow-sm"
            >
              <Icon name="chevron-right" decorative />
            </Button>
          </div>
        </>
      )}

      {indicators && count > 1 && (
        <div className="flex justify-center gap-2 mt-3" aria-hidden="true">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={[
                'h-2.5 rounded-full transition-colors',
                i === activeIndex ? 'bg-brand-primary w-6' : 'bg-gray-300 w-2.5 hover:bg-gray-400',
              ].join(' ')}
              aria-label={`Ir al slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export type { CarouselProps, VisibleConfig }
export default Carousel
