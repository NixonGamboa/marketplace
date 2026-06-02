import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:        '#2F7D32',
          'primary-dark': '#1B5E20',
          'primary-light':'#81C784',
          bg:             '#F8F4EE',
          surface:        '#FFFFFF',
          dark:           '#1A1A1A',
          muted:          '#5C5C5C',
          border:         '#D6CFC4',
          warning:        '#E65100',
          'warning-bg':   '#FFF3E0',
          error:          '#B71C1C',
          whatsapp:       '#25D366',
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
} satisfies Config
