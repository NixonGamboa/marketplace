/**
 * @spec CU-1, SC-13 — Página de login del panel admin.
 * Llama authRepo.login; en éxito redirige a state.from o '/'.
 * En fallo muestra toast 'Credenciales inválidas'.
 * Estado loading desactiva el formulario durante la petición.
 */
import { useRef, useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { emailInputSchema } from '@shared/contracts'
import { useSession } from '@/auth/useSession'
import { useToast } from '@/ui/Toast'
import { Spinner } from '@/ui/Spinner'
import { FieldError } from '@/ui/FieldError'
import { fieldErrorId, invalidInputClass } from '@/ui/fieldStyles'
import { isDemoMode } from '@/services'
import { ApiError } from '@/services/http/apiError'

interface LocationState {
  from?: { pathname: string }
}

/** Un 401 en el login son credenciales inválidas (no «sesión expirada»); el resto conserva el mensaje del servidor. */
function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Credenciales inválidas'
  if (error.kind === 'unauthenticated' || error.kind === 'invalid_request' || error.kind === 'validation') {
    return 'Credenciales inválidas'
  }
  if (error.kind === 'rate_limited' && error.retryAfterSeconds !== undefined) {
    return `Demasiados intentos. Intenta de nuevo en ${Math.ceil(error.retryAfterSeconds / 60)} min.`
  }
  return error.message
}

const INPUT_CLASS = 'px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-1 disabled:bg-gray-50 transition'
const VALID_INPUT_CLASS = 'border-gray-300 focus:border-indigo-400 focus:ring-indigo-200'

function emailProblem(email: string): string | null {
  const trimmed = email.trim()
  if (!trimmed) return 'Escribe tu correo electrónico.'
  // Misma validación que el servidor (contrato de auth): un correo mal formado se señala aquí, no como «Credenciales inválidas».
  return emailInputSchema.safeParse(trimmed).success ? null : 'Escribe un correo válido, por ejemplo nombre@dominio.com.'
}

export function LoginPage() {
  const { login, sessionExpired } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Ingreso: la contraseña solo es obligatoria; no se reimpone la política de alta a cuentas existentes.
  const emailIssue = emailProblem(email)
  const passwordIssue = password ? null : 'Escribe tu contraseña.'
  const emailError = attempted ? emailIssue : null
  const passwordError = attempted ? passwordIssue : null

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setAttempted(true)
    if (emailIssue || passwordIssue) {
      (emailIssue ? emailRef : passwordRef).current?.focus()
      return
    }
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (error) {
      toast.error(loginErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">MAUI Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Inicia sesión para continuar</p>
        </div>

        {sessionExpired && (
          <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Tu sesión expiró. Vuelve a iniciar sesión.
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-8 flex flex-col gap-5"
          aria-label="Formulario de inicio de sesión"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className="text-sm font-medium text-gray-700">
              Correo electrónico
            </label>
            <input
              id="login-email"
              ref={emailRef}
              type="email"
              autoComplete="email"
              aria-required="true"
              aria-invalid={emailError !== null}
              aria-describedby={emailError ? fieldErrorId('login-email') : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className={`${INPUT_CLASS} ${emailError ? invalidInputClass : VALID_INPUT_CLASS}`}
              placeholder={isDemoMode ? 'owner@lechemiel.demo' : undefined}
            />
            <FieldError id="login-email" message={emailError} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-password" className="text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              id="login-password"
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              aria-required="true"
              aria-invalid={passwordError !== null}
              aria-describedby={passwordError ? fieldErrorId('login-password') : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className={`${INPUT_CLASS} ${passwordError ? invalidInputClass : VALID_INPUT_CLASS}`}
              placeholder={isDemoMode ? 'demo1234' : undefined}
            />
            <FieldError id="login-password" message={passwordError} />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition"
          >
            {loading && <Spinner size={16} label="Iniciando sesión" />}
            {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
