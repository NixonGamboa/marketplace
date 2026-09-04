import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import Icon from '@/shared/components/ui/Icon'
import logoMaui from '@/assets/logo/imagotipo.png'

type Step = 'phone' | 'sent'

/** Colombia: 10 dígitos, primer dígito 3 (celular). */
const isValidCoMobile = (digits: string) => /^3\d{9}$/.test(digits)

/** Agrupa los 10 dígitos como `300 123 4567`. */
function formatPhoneDisplay(digits: string) {
  const trimmed = digits.slice(0, 10)
  const a = trimmed.slice(0, 3)
  const b = trimmed.slice(3, 6)
  const c = trimmed.slice(6, 10)
  return [a, b, c].filter(Boolean).join(' ')
}

export default function AuthPage() {
  const navigate = useNavigate()
  const { login, loading } = useAuthStore()

  const [step, setStep] = useState<Step>('phone')
  const [rawDigits, setRawDigits] = useState('')
  const [touched, setTouched] = useState(false)

  const valid = isValidCoMobile(rawDigits)
  const fullPhone = `+57${rawDigits}`
  const displayPhone = `+57 ${formatPhoneDisplay(rawDigits)}`

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 10)
    setRawDigits(onlyDigits)
  }

  const handleSendLink = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    setStep('sent')
  }

  const handleConfirm = async () => {
    await login(fullPhone)
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo + tagline */}
        <div className="flex flex-col items-center gap-3 mb-8">
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

        <div className="bg-white rounded-3xl border border-brand-border shadow-elevated p-6 md:p-8 flex flex-col gap-6">
          {step === 'phone' ? (
            <form onSubmit={handleSendLink} className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#E8F5E9] flex items-center justify-center">
                  <Icon name="whatsapp" size="lg" className="text-brand-whatsapp" decorative />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-brand-dark">Ingresa con WhatsApp</h1>
                  <p className="text-brand-muted text-sm mt-1 leading-relaxed">
                    Escribe tu número y te enviamos un enlace.<br />
                    Sin contraseña, sin complicaciones.
                  </p>
                </div>
              </div>

              <div className="border-t border-brand-border" />

              <div className="flex flex-col gap-1.5">
                <label htmlFor="phone" className="text-[13px] font-medium text-brand-dark/90">
                  Número de WhatsApp
                </label>
                <div
                  className={[
                    'flex items-center rounded-2xl border bg-white transition-all',
                    touched && !valid
                      ? 'border-brand-error focus-within:ring-2 focus-within:ring-brand-error/20'
                      : 'border-brand-border focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/20',
                  ].join(' ')}
                >
                  <span className="pl-4 pr-2 py-3 text-sm font-semibold text-brand-dark border-r border-brand-border select-none">
                    +57
                  </span>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    autoFocus
                    placeholder="300 123 4567"
                    value={formatPhoneDisplay(rawDigits)}
                    onChange={handlePhoneChange}
                    onBlur={() => setTouched(true)}
                    aria-invalid={touched && !valid}
                    className="flex-1 bg-transparent px-3 py-3 text-base tabular-nums text-brand-dark placeholder:text-brand-muted/60 outline-none"
                  />
                </div>
                {touched && !valid && (
                  <p className="text-[12px] text-brand-error font-medium" role="alert">
                    Ingresa un celular colombiano válido (10 dígitos, empieza con 3).
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!valid || loading}
                className={[
                  'w-full h-14 rounded-2xl font-bold text-base text-white',
                  'bg-brand-whatsapp hover:bg-[#128C7E] active:scale-[0.99]',
                  'transition-all shadow-md flex items-center justify-center gap-3',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
                ].join(' ')}
              >
                <Icon name="whatsapp" size="md" decorative />
                Enviar enlace por WhatsApp
              </button>

              <p className="text-center text-xs text-brand-muted leading-relaxed">
                Solo usamos tu número para enviarte el enlace de acceso.
                No compartimos tu información con terceros.
              </p>
            </form>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#E8F5E9] flex items-center justify-center">
                  <Check className="w-7 h-7 text-brand-whatsapp" aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-brand-dark">Enlace enviado</h1>
                  <p className="text-brand-muted text-sm mt-1 leading-relaxed">
                    Te enviamos un mensaje por WhatsApp a
                  </p>
                  <p className="text-brand-dark font-semibold mt-1 tabular-nums">{displayPhone}</p>
                </div>
              </div>

              <div className="bg-brand-bg rounded-2xl border border-brand-border p-4 text-[13px] text-brand-muted leading-relaxed">
                Abre WhatsApp y toca el enlace que te enviamos para confirmar tu ingreso.
                Para esta demo, puedes continuar directamente.
              </div>

              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className={[
                  'w-full h-14 rounded-2xl font-bold text-base text-white',
                  'bg-brand-primary hover:bg-brand-primary-dark active:scale-[0.99]',
                  'transition-all shadow-md flex items-center justify-center gap-2',
                  'disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100',
                ].join(' ')}
              >
                {loading ? (
                  <span className="inline-block w-5 h-5 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />
                ) : (
                  <>
                    Continuar
                    <ArrowRight size={18} aria-hidden="true" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep('phone')}
                className="flex items-center justify-center gap-1.5 text-brand-muted hover:text-brand-dark text-sm font-medium transition-colors"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Usar otro número
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-brand-muted hover:text-brand-dark text-sm font-medium transition-colors"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
