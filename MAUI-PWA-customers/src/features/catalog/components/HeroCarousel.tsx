import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { HeroSlide } from '@/assets/hero'

interface HeroCarouselProps {
  slides: HeroSlide[]
  autoplayInterval?: number
}

export default function HeroCarousel({ slides, autoplayInterval = 5000 }: HeroCarouselProps) {
  const navigate = useNavigate()
  const [active, setActive] = useState(0)
  const pausedRef = useRef(false)
  const count = slides.length

  useEffect(() => {
    if (count <= 1) return
    const timer = setInterval(() => {
      if (!pausedRef.current) setActive(prev => (prev + 1) % count)
    }, autoplayInterval)
    return () => clearInterval(timer)
  }, [autoplayInterval, count])

  const goTo = (index: number) => setActive(index)
  const goPrev = () => setActive(prev => (prev - 1 + count) % count)
  const goNext = () => setActive(prev => (prev + 1) % count)

  return (
    <section
      aria-label="Banner principal"
      className="relative overflow-hidden rounded-2xl border border-brand-primary/10 min-h-[220px] md:min-h-[300px]"
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
      onFocus={() => { pausedRef.current = true }}
      onBlur={() => { pausedRef.current = false }}
    >
      {slides.map((slide, i) => {
        const titleParts = slide.title.split('\n')
        return (
          <div
            key={i}
            className={`absolute inset-0 transition-opacity duration-700 ${i === active ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden={i !== active}
          >
            <img
              src={slide.image}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover object-center select-none"
            />

            {/* Overlay: gradient horizontal (izq → der) en ambos breakpoints; móvil con más opacidad por menos ancho */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/65 to-white/5 md:from-white md:via-white/75 md:to-transparent" />

            <div className="relative z-10 p-5 md:p-8 flex items-center min-h-[220px] md:min-h-[300px]">
              <div className="flex-1 max-w-xs md:max-w-sm flex flex-col items-start">
                <p className="text-[10px] md:text-xs font-bold text-brand-primary uppercase tracking-widest mb-2">
                  {slide.eyebrow}
                </p>
                <h1 className="text-lg md:text-[28px] font-extrabold text-brand-dark leading-tight mb-2.5">
                  {titleParts.map((line, j) => (
                    <span key={j}>
                      {line}
                      {j < titleParts.length - 1 && <br />}
                    </span>
                  ))}
                </h1>
                <p className="text-brand-muted text-[11px] md:text-sm mb-5 max-w-[55%] md:max-w-xs leading-relaxed">
                  {slide.description}
                </p>
                <button
                  onClick={() => navigate(slide.buttonHref)}
                  className="bg-brand-primary hover:bg-brand-primary-dark active:bg-brand-primary-dark text-white font-semibold px-4 py-2 md:px-5 md:py-2.5 rounded-xl text-xs md:text-sm transition-colors shadow-brand-sm inline-flex items-center gap-1.5 md:gap-2 self-start w-fit group"
                >
                  {slide.buttonText}
                  <ChevronRight size={14} strokeWidth={2.2} className="md:w-4 md:h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {slide.badge && (
              <div className="hidden md:flex absolute top-5 right-5 z-20 w-[72px] h-[72px] rounded-full bg-white/95 border-2 border-brand-primary/30 flex-col items-center justify-center shadow-brand-md text-center px-1">
                <span className="text-[10px] font-extrabold text-brand-primary leading-tight">{slide.badge.line1}</span>
                <span className="text-[9px] text-brand-muted font-semibold leading-tight">{slide.badge.line2}</span>
                {slide.badge.line3 && (
                  <span className="text-[9px] text-brand-muted font-semibold leading-tight">{slide.badge.line3}</span>
                )}
              </div>
            )}
          </div>
        )
      })}

      {count > 1 && (
        <>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Ir al slide ${i + 1}`}
                className={
                  i === active
                    ? 'bg-brand-primary h-2 w-5 rounded-full transition-all duration-300'
                    : 'bg-brand-primary/30 h-2 w-2 rounded-full transition-all duration-300 hover:bg-brand-primary/50 cursor-pointer'
                }
              />
            ))}
          </div>

          <button
            onClick={goPrev}
            aria-label="Slide anterior"
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-white/85 hover:bg-white border border-gray-200 rounded-full p-1.5 shadow-sm transition-colors"
          >
            <ChevronLeft size={16} className="text-brand-dark" />
          </button>

          <button
            onClick={goNext}
            aria-label="Siguiente slide"
            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-white/85 hover:bg-white border border-gray-200 rounded-full p-1.5 shadow-sm transition-colors"
          >
            <ChevronRight size={16} className="text-brand-dark" />
          </button>
        </>
      )}
    </section>
  )
}
