import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-pressed={isDark}
      className="flex shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-2xl bg-brand-primary/10 items-center justify-center hover:bg-brand-primary/20 transition-colors"
    >
      {isDark
        ? <Sun  size={18} strokeWidth={1.8} className="text-brand-primary" aria-hidden="true" />
        : <Moon size={18} strokeWidth={1.8} className="text-brand-primary" aria-hidden="true" />
      }
    </button>
  )
}
