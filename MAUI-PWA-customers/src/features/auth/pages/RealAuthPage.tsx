/**
 * Ingreso y registro reales (modo real). La sesión la abre el servidor con cookie HttpOnly: aquí
 * no hay enlace ficticio ni "continuar" sin credenciales. El celular es un dato de contacto NO
 * verificado (sin OTP) y la contraseña se valida con la política del contrato.
 */
import { useRef, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { PASSWORD_LIMITS, ACCOUNT_NAME_MAX_LENGTH } from '@shared/contracts'
import { useAuthStore } from '@/stores/authStore'
import { authErrorMessage, type AuthMode } from '../authErrorMessage'
import logoMaui from '@/assets/logo/imagotipo.webp'
import type { AuthRedirectState } from '../RequireSession'

/** Colombia: 10 dígitos, primer dígito 3 (celular). */
const isValidCoMobile = (digits: string) => /^3\d{9}$/.test(digits)

/** Agrupa los 10 dígitos como `300 123 4567`. */
function formatPhoneDisplay(digits: string) {
  const trimmed = digits.slice(0, 10)
  return [trimmed.slice(0, 3), trimmed.slice(3, 6), trimmed.slice(6, 10)].filter(Boolean).join(' ')
}

const INPUT_BASE = 'rounded-2xl border bg-white px-4 py-3 text-base text-brand-dark outline-none focus:ring-2'
const inputTone = (invalid: boolean) => invalid
  ? 'border-brand-error focus:border-brand-error focus:ring-brand-error/20'
  : 'border-brand-border focus:border-brand-primary focus:ring-brand-primary/20'

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null
  return <p id={id} role="alert" className="text-[12px] font-medium text-brand-error">{message}</p>
}

/** En registro aplica la política de contraseña del contrato; en ingreso solo exige que no esté vacía. */
function passwordProblem(mode: AuthMode, password: string): string | null {
  if (password.length === 0) return 'Escribe tu contraseña.'
  if (mode === 'login') return null
  if (password.length < PASSWORD_LIMITS.min) return `La contraseña debe tener al menos ${PASSWORD_LIMITS.min} caracteres.`
  if (password.length > PASSWORD_LIMITS.max) return `La contraseña no puede superar ${PASSWORD_LIMITS.max} caracteres.`
  return null
}

export default function RealAuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signUp, loading, sessionExpired } = useAuthStore()
  const redirect = (location.state as AuthRedirectState | null) ?? {}

  const [mode, setMode] = useState<AuthMode>('login')
  const [rawDigits, setRawDigits] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Los problemas se calculan siempre, pero solo se muestran tras intentar enviar; al corregir desaparecen solos.
  const nameProblem = mode === 'register' && name.trim().length < 2 ? 'Escribe tu nombre (mínimo 2 caracteres).' : null
  const phoneProblem = isValidCoMobile(rawDigits) ? null : 'Ingresa un celular colombiano válido (10 dígitos, empieza con 3).'
  const passwordIssue = passwordProblem(mode, password)
  const nameError = touched ? nameProblem : null
  const phoneError = touched ? phoneProblem : null
  const passwordError = touched ? passwordIssue : null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setTouched(true)
    setError(null)
    if (nameProblem || phoneProblem || passwordIssue) {
      const firstInvalid = nameProblem ? nameRef : phoneProblem ? phoneRef : passwordRef
      firstInvalid.current?.focus()
      return
    }
    const phone = `+57${rawDigits}`
    try {
      if (mode === 'register') await signUp({ name: name.trim(), phone, password })
      else await signIn(phone, password)
      navigate(redirect.from ?? '/', { replace: true })
    } catch (failure) {
      setError(authErrorMessage(failure, mode))
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src={logoMaui} alt="Logo MAUI" className="h-14 w-auto select-none" draggable={false} />
          <p className="text-brand-muted text-sm text-center">Tu mercado local, a un mensaje de distancia</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label={mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          className="bg-white rounded-3xl border border-brand-border shadow-elevated p-6 md:p-8 flex flex-col gap-5"
        >
          <h1 className="text-xl font-bold text-brand-dark text-center">
            {mode === 'login' ? 'Ingresa a tu cuenta' : 'Crea tu cuenta'}
          </h1>

          {(redirect.expired || sessionExpired) && (
            <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Tu sesión expiró. Vuelve a ingresar para continuar.
            </p>
          )}

          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-name" className="text-[13px] font-medium text-brand-dark/90">Tu nombre</label>
              <input
                id="auth-name"
                ref={nameRef}
                type="text"
                autoComplete="name"
                maxLength={ACCOUNT_NAME_MAX_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={nameError !== null}
                aria-describedby={nameError ? 'auth-name-error' : undefined}
                className={`${INPUT_BASE} ${inputTone(nameError !== null)}`}
              />
              <FieldError id="auth-name-error" message={nameError} />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-phone" className="text-[13px] font-medium text-brand-dark/90">Celular</label>
            <div
              className={[
                'flex items-center rounded-2xl border bg-white transition-all',
                phoneError
                  ? 'border-brand-error focus-within:ring-2 focus-within:ring-brand-error/20'
                  : 'border-brand-border focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/20',
              ].join(' ')}
            >
              <span className="pl-4 pr-2 py-3 text-sm font-semibold text-brand-dark border-r border-brand-border select-none">+57</span>
              <input
                id="auth-phone"
                ref={phoneRef}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="300 123 4567"
                value={formatPhoneDisplay(rawDigits)}
                onChange={(e) => setRawDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                aria-invalid={phoneError !== null}
                aria-describedby={phoneError ? 'auth-phone-error' : undefined}
                className="flex-1 bg-transparent px-3 py-3 text-base tabular-nums text-brand-dark placeholder:text-brand-muted/60 outline-none"
              />
            </div>
            <FieldError id="auth-phone-error" message={phoneError} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-password" className="text-[13px] font-medium text-brand-dark/90">Contraseña</label>
            <input
              id="auth-password"
              ref={passwordRef}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              maxLength={PASSWORD_LIMITS.max}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={passwordError !== null}
              aria-describedby={[mode === 'register' && 'auth-password-help', passwordError && 'auth-password-error']
                .filter(Boolean).join(' ') || undefined}
              className={`${INPUT_BASE} ${inputTone(passwordError !== null)}`}
            />
            <FieldError id="auth-password-error" message={passwordError} />
            {mode === 'register' && (
              <p id="auth-password-help" className="text-xs text-brand-muted">
                Mínimo {PASSWORD_LIMITS.min} caracteres.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 rounded-2xl font-bold text-base text-white bg-brand-primary hover:bg-brand-primary-dark active:scale-[0.99] transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>

          <p className="text-center text-xs text-brand-muted leading-relaxed">
            Usamos tu celular solo para contactarte sobre tus pedidos. No lo verificamos por mensaje.
          </p>

          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setTouched(false) }}
            className="text-sm font-medium text-brand-primary hover:underline"
          >
            {mode === 'login' ? '¿Primera vez? Crea tu cuenta' : 'Ya tengo cuenta'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/" className="text-brand-muted hover:text-brand-dark text-sm font-medium transition-colors">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
