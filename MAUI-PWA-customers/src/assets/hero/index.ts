import heroParque from './hero-parque.png'
import heroSupermercadoAbarrotes from './hero-supermercado-abarrotes.png'

export { heroParque, heroSupermercadoAbarrotes }

export interface HeroSlide {
  image: string
  eyebrow: string
  title: string
  description: string
  buttonText: string
  buttonHref: string
  badge?: { line1: string; line2: string; line3?: string }
}

export const heroSlides: HeroSlide[] = [
  {
    image: heroParque,
    eyebrow: 'Juntos por Dolores, Tolima',
    title: 'Maui y Leche y Miel,\nmás cerca de ti',
    description: 'La calidad, variedad y precios de Leche y Miel, ahora en Maui.',
    buttonText: 'Comprar en Maui',
    buttonHref: '/catalog',
    badge: { line1: 'Tu', line2: 'supermercado', line3: 'de confianza' },
  },
  {
    image: heroSupermercadoAbarrotes,
    eyebrow: 'Fresco · Local · Rápido',
    title: 'Productos frescos\ntodos los días',
    description: 'Abarrotes, lácteos, embutidos y mucho más, directo a tu hogar.',
    buttonText: 'Comprar ahora',
    buttonHref: '/catalog/lacteos',
    badge: { line1: '100%', line2: 'Frescura', line3: 'Garantizada' },
  },
]
