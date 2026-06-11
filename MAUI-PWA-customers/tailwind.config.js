/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
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
          primary:        'rgb(var(--brand-primary) / <alpha-value>)',
          'primary-dark': 'rgb(var(--brand-primary-dark) / <alpha-value>)',
          'primary-light':'rgb(var(--brand-primary-light) / <alpha-value>)',
          secondary:      'rgb(var(--brand-secondary) / <alpha-value>)',
          bg:             'rgb(var(--brand-bg) / <alpha-value>)',
          surface:        'rgb(var(--brand-surface) / <alpha-value>)',
          dark:           'rgb(var(--brand-dark) / <alpha-value>)',
          muted:          'rgb(var(--brand-muted) / <alpha-value>)',
          border:         'rgb(var(--brand-border) / <alpha-value>)',
          warning:        'rgb(var(--brand-warning) / <alpha-value>)',
          'warning-bg':   'rgb(var(--brand-warning-bg) / <alpha-value>)',
          error:          'rgb(var(--brand-error) / <alpha-value>)',
          whatsapp:       '#25D366',
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
        'brand-sm':   'var(--shadow-brand-sm)',
        'brand-md':   'var(--shadow-brand-md)',
        'card':       'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        'elevated':   'var(--shadow-elevated)',
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
        'slide-in-right': {
          from: { opacity: '0.4', transform: 'translateX(100%)' },
          to:   { opacity: '1',   transform: 'translateX(0)' },
        },
        'slide-in-left': {
          from: { opacity: '0.4', transform: 'translateX(-100%)' },
          to:   { opacity: '1',   transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in':         'fade-in 0.2s ease',
        'slide-in-top':    'slide-in-top 0.25s ease',
        'slide-in-bottom': 'slide-in-bottom 0.25s ease',
        'scale-in':        'scale-in 0.2s ease',
        'slide-in-right':  'slide-in-right 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-in-left':   'slide-in-left 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
      },
      zIndex: {
        60: '60',
        70: '70',
      },
    },
  },
  plugins: [],
}
