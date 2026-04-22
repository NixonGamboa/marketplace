import { useAuthStore } from '@/stores/authStore'
import Button from '@/shared/components/ui/Button'
import Icon from '@/shared/components/ui/Icon'

export default function AuthPage() {
  const { login, loading } = useAuthStore()

  return (
    <div className="max-w-sm mx-auto px-4 py-16 flex flex-col items-center gap-6 text-center">
      <Icon name="whatsapp" size="lg" className="text-brand-whatsapp" decorative />
      <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
      <p className="text-brand-muted text-sm">
        Ingresa con tu número de WhatsApp para continuar.
      </p>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={loading}
        onClick={() => login('')}
        aria-label="Ingresar con WhatsApp"
      >
        <Icon name="whatsapp" size="md" decorative />
        Ingresar con WhatsApp
      </Button>
    </div>
  )
}
