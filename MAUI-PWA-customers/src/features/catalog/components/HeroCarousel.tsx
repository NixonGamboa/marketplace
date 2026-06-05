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
      className="relative overflow-hidden rounded-2xl border border-brand-primary/10 min-h-[220px] md:min-h-[340px]"
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

            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-white/20 md:bg-gradient-to-r md:from-white md:via-white/40 md:to-white/10" />

            <div className="relative z-10 p-6 md:p-8 flex items-start md:items-center min-h-[220px] md:min-h-[340px]">
              <div className="flex-1 max-w-sm flex flex-col items-start">
                <p className="hidden md:block text-xs font-semibold text-brand-primary uppercase tracking-widest mb-2">
                  {slide.eyebrow}
                </p>
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#1F2937] leading-tight mb-3">
                  {titleParts.map((line, j) => (
                    <span key={j}>
                      {line}
                      {j < titleParts.length - 1 && <br />}
                    </span>
                  ))}
                </h1>
                <p className="text-[#6B7280] text-sm mb-5 max-w-xs leading-relaxed">
                  {slide.description}
                </p>
                <button
                  onClick={() => navigate(slide.buttonHref)}
                  className="bg-brand-primary hover:bg-brand-primary-dark active:bg-brand-primary-dark text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors shadow-brand-sm inline-flex items-center gap-2 self-start w-fit"
                >
                  {slide.buttonText}
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {slide.badge && (
              <div className="hidden md:flex absolute top-4 right-4 z-20 w-16 h-16 rounded-full bg-white/90 border-2 border-brand-primary/20 flex-col items-center justify-center shadow-brand-sm text-center">
                <span className="text-[9px] font-bold text-brand-primary leading-tight">{slide.badge.line1}</span>
                <span className="text-[8px] text-brand-muted font-medium leading-tight">{slide.badge.line2}</span>
                {slide.badge.line3 && (
                  <span className="text-[8px] text-brand-muted font-medium leading-tight">{slide.badge.line3}</span>
                )}
              </div>
            )}
          </div>
        )
      })}

      {count > 1 && (
        <>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Ir al slide ${i + 1}`}
                className={
                  i === active
                    ? 'bg-white h-2 w-6 rounded-full transition-all duration-300'
                    : 'bg-white/50 h-2 w-2 rounded-full transition-all duration-300 hover:bg-white/75 cursor-pointer'
                }
              />
            ))}
          </div>

          <button
            onClick={goPrev}
            aria-label="Slide anterior"
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-white/80 hover:bg-white border border-white/50 rounded-full p-1.5 shadow-sm transition-colors"
          >
            <ChevronLeft size={18} className="text-brand-dark" />
          </button>

          <button
            onClick={goNext}
            aria-label="Siguiente slide"
            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-white/80 hover:bg-white border border-white/50 rounded-full p-1.5 shadow-sm transition-colors"
          >
            <ChevronRight size={18} className="text-brand-dark" />
          </button>
        </>
      )}
    </section>
  )
}
