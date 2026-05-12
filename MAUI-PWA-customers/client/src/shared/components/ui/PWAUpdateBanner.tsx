import { useUIStore } from '@/stores/uiStore'
import Button from './Button'

export function PWAUpdateBanner() {
  const updateAvailable = useUIStore((s) => s.updateAvailable)

  if (!updateAvailable) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 flex items-center gap-3 rounded-xl bg-brand-primary px-4 py-3 text-white shadow-brand-md text-sm font-medium animate-fade-in"
    >
      <span>Nueva versión disponible</span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => window.location.reload()}
      >
        Actualizar
      </Button>
    </div>
  )
}
