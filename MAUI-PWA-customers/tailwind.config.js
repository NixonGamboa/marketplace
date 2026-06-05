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
          primary:        '#5B3DF5', // morado principal MAUI — CTAs, precios, focus rings
          'primary-dark': '#4A30D4', // hover/pressed
          'primary-light':'#EEF2FF', // chips seleccionados, fondos suaves
          secondary:      '#7C5CFF', // morado secundario
          bg:             '#F8F9FC', // fondo de página
          surface:        '#FFFFFF', // cards, modales, inputs
          dark:           '#1F2937', // texto principal
          muted:          '#6B7280', // texto secundario
          border:         '#E8EAF3', // bordes de cards, divisores
          warning:        '#C2410C', // badge peso variable
          'warning-bg':   '#FFF7ED', // fondo del badge warning
          error:          '#B91C1C', // estado cerrado, errores
          whatsapp:       '#25D366', // sin cambio
        },
        gray: {
          50:  '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        'brand-sm':   '0 2px 8px rgba(67, 56, 202, 0.18)',
        'brand-md':   '0 8px 32px rgba(67, 56, 202, 0.28)',
        'card':       '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
        'card-hover': '0 4px 16px rgba(15, 23, 42, 0.10)',
        'elevated':   '0 10px 40px rgba(15, 23, 42, 0.12)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
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
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in':         'fade-in 0.2s ease',
        'slide-in-top':    'slide-in-top 0.25s ease',
        'slide-in-bottom': 'slide-in-bottom 0.25s ease',
        'scale-in':        'scale-in 0.2s ease',
      },
      zIndex: {
        60: '60',
        70: '70',
      },
    },
  },
  plugins: [],
}
