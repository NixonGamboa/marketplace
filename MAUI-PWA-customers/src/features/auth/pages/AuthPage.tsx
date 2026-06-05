import { useAuthStore } from '@/stores/authStore'
import Icon from '@/shared/components/ui/Icon'
import logoMaui from '@/assets/logo/imagotipo.png'

export default function AuthPage() {
  const { login, loading } = useAuthStore()

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4 py-12">
      {/* Card principal */}
      <div className="w-full max-w-sm">

        {/* Logo + nombre */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <img
            src={logoMaui}
            alt="Logo MAUI"
            className="h-14 w-auto select-none"
            draggable={false}
          />
          <p className="text-brand-muted text-sm text-center">
            Tu mercado local, a un mensaje de distancia
          </p>
        </div>

        {/* Card de login */}
        <div className="bg-white rounded-3xl border border-brand-border shadow-elevated p-8 flex flex-col gap-6">

          {/* Ícono WhatsApp */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#E8F5E9] flex items-center justify-center">
              <Icon name="whatsapp" size="lg" className="text-brand-whatsapp" decorative />
            </div>
            <div>
              <h1 className="text-xl font-bold text-brand-dark">Ingresa con WhatsApp</h1>
              <p className="text-brand-muted text-sm mt-1 leading-relaxed">
                Te enviamos un enlace por WhatsApp.<br />Sin contraseña, sin complicaciones.
              </p>
            </div>
          </div>

          {/* Divisor */}
          <div className="border-t border-brand-border" />

          {/* Botón */}
          <button
            onClick={() => login('')}
            disabled={loading}
            className={[
              'w-full h-14 rounded-2xl font-bold text-base text-white',
              'bg-brand-whatsapp hover:bg-[#128C7E] active:scale-[0.99]',
              'transition-all shadow-md flex items-center justify-center gap-3',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            ].join(' ')}
            aria-label="Ingresar con WhatsApp"
          >
            {loading ? (
              <span className="inline-block w-5 h-5 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />
            ) : (
              <Icon name="whatsapp" size="md" decorative />
            )}
            {loading ? 'Enviando enlace...' : 'Entrar con WhatsApp'}
          </button>

          {/* Nota de privacidad */}
          <p className="text-center text-xs text-brand-muted leading-relaxed">
            Solo usamos tu número para enviarte el enlace de acceso.
            No compartimos tu información con terceros.
          </p>
        </div>
      </div>
    </div>
  )
}
