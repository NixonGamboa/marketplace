/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: [
    // Clases generadas dinámicamente por Carousel (widthClasses + controlsBreakpoint)
    'sm:basis-1/2', 'sm:basis-1/3', 'sm:basis-1/4', 'sm:basis-1/5', 'sm:basis-1/6',
    'md:basis-1/2', 'md:basis-1/3', 'md:basis-1/4', 'md:basis-1/5', 'md:basis-1/6',
    'lg:basis-1/2', 'lg:basis-1/3', 'lg:basis-1/4', 'lg:basis-1/5', 'lg:basis-1/6',
    'xl:basis-1/2', 'xl:basis-1/3', 'xl:basis-1/4', 'xl:basis-1/5', 'xl:basis-1/6',
    'sm:flex', 'md:flex', 'lg:flex', 'xl:flex',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:        '#2F7D32', // verde CTA principal — 7.3:1 vs fondo crema
          'primary-dark': '#1B5E20', // hover/focus de primary
          'primary-light':'#81C784', // hover backgrounds suaves
          bg:             '#F8F4EE', // fondo de página (crema cálida)
          surface:        '#FFFFFF', // cards, modales, inputs
          dark:           '#1A1A1A', // texto principal — 14.7:1 vs bg
          muted:          '#5C5C5C', // texto secundario — 7.1:1 vs bg
          border:         '#D6CFC4', // bordes de cards, divisores
          warning:        '#E65100', // badge peso variable — 7.2:1 vs bg
          'warning-bg':   '#FFF3E0', // fondo del badge warning
          error:          '#B71C1C', // estado cerrado, errores — 9:1 vs bg
          whatsapp:       '#25D366', // sin cambio
        },
        gray: {
          50:  '#F9F7F4',
          100: '#F0EDE8',
          200: '#E0DAD2',
          300: '#C8BFB4',
          400: '#A89F93',
          500: '#857D72',
          600: '#635D54',
          700: '#433F38',
          800: '#2A2722',
          900: '#1A1815',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'system-ui', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        'brand-sm': '0 1px 4px rgba(47, 125, 50, 0.12)',
        'brand-md': '0 4px 16px rgba(47, 125, 50, 0.20)',
        'card':     '0 1px 3px rgba(26, 26, 26, 0.08), 0 1px 2px rgba(26, 26, 26, 0.04)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'slide-in-top': {
          from: { opacity: '0', transform: 'translateY(-0.5rem)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-bottom': {
          from: { opacity: '0', transform: 'translateY(1rem)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in':         'fade-in 0.25s ease',
        'slide-in-top':    'slide-in-top 0.3s ease',
        'slide-in-bottom': 'slide-in-bottom 0.3s ease',
      },
      zIndex: {
        60: '60',
        70: '70',
      },
    },
  },
  plugins: [],
}
