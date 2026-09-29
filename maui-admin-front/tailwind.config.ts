import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:        '#5B3DF5',
          'primary-dark': '#4A30D4',
          'primary-light':'#EEF2FF',
          secondary:      '#7C5CFF',
          bg:             '#F8F9FC',
          surface:        '#FFFFFF',
          dark:           '#1F2937',
          muted:          '#6B7280',
          border:         '#E8EAF3',
          warning:        '#C2410C',
          'warning-bg':   '#FFF7ED',
          error:          '#B91C1C',
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
        'brand-sm': '0 2px 8px rgba(67, 56, 202, 0.18)',
        'brand-md': '0 8px 32px rgba(67, 56, 202, 0.28)',
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
} satisfies Config
