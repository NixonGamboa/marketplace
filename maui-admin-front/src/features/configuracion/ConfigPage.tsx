/**
 * @spec §14, CU-13, US-13, TASK-024, ADR-007
 * Form editable del MerchantConfig (name/whatsapp/address) + sección Demo con ResetDemoButton.
 * `whatsapp` se normaliza a sólo dígitos antes de persistir para que `wa.me/{phone}` lo consuma directo.
 */
import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { STORE_LIMITS } from '@shared/contracts'
import type { MerchantConfig } from '@/types/merchant'
import { isDemoMode, merchantRepo } from '@/services'
import { useSession } from '@/auth/useSession'
import { useToast } from '@/ui/Toast'
import { Spinner } from '@/ui/Spinner'
import { FieldError } from '@/ui/FieldError'
import { fieldErrorId, invalidInputClass } from '@/ui/fieldStyles'
import { normalizePhone, formatPhonePretty } from '@/lib/phone'
import { errorMessage } from '@/lib/errorMessage'
import { ResetDemoButton } from './ResetDemoButton'

function normalizeMerchantWhatsApp(raw: string): string | null {
  if (!/^\+?[\d\s()-]+$/.test(raw.trim())) return null
  const digits = normalizePhone(raw)
  const phone = /^3\d{9}$/.test(digits) ? `57${digits}` : digits
  return /^573\d{9}$/.test(phone) && phone !== '573000000000' ? phone : null
}

type ConfigField = 'name' | 'whatsapp' | 'address'
type ConfigErrors = Partial<Record<ConfigField, string>>

const FIELD_ORDER: readonly ConfigField[] = ['name', 'whatsapp', 'address']
const FIELD_IDS: Record<ConfigField, string> = { name: 'cfg-name', whatsapp: 'cfg-whatsapp', address: 'cfg-address' }
const INPUT_CLASS = 'w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-1'
const VALID_INPUT_CLASS = 'border-gray-300 focus:border-indigo-400 focus:ring-indigo-200'

function validateConfig(config: MerchantConfig): ConfigErrors {
  const errors: ConfigErrors = {}
  // Mismos límites (con trim) que el contrato de la tienda, para no enviar lo que el servidor rechazaría.
  const nameLength = config.name.trim().length
  if (nameLength < 2) errors.name = 'Escribe el nombre del negocio (mínimo 2 caracteres).'
  if (!normalizeMerchantWhatsApp(config.whatsapp)) {
    errors.whatsapp = 'Ingresa un celular colombiano válido, distinto al número de ejemplo.'
  }
  if (!config.address.trim()) errors.address = 'Escribe la dirección.'
  return errors
}

/** Atributos de accesibilidad y estilo de un campo validado. */
function fieldProps(id: string, error: string | undefined, extraClass = '') {
  return {
    'aria-invalid': error !== undefined,
    'aria-describedby': error ? fieldErrorId(id) : undefined,
    className: `${INPUT_CLASS} ${error ? invalidInputClass : VALID_INPUT_CLASS} ${extraClass}`.trim(),
  }
}

export function ConfigPage() {
  const { session } = useSession()
  const toast = useToast()
  const merchantId = session?.user.merchantId ?? 'mch_lechemiel'
  const by = session?.user.email ?? 'demo'

  const [config, setConfig] = useState<MerchantConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    let cancelled = false
    merchantRepo
      .get(merchantId)
      .then((cfg) => { if (!cancelled) setConfig(cfg) })
      .catch((err: unknown) => { if (!cancelled) toast.error(errorMessage(err, 'No se pudo cargar la configuración')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [merchantId, toast])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!config || saving) return
    setAttempted(true)
    const firstInvalid = FIELD_ORDER.find((field) => validateConfig(config)[field])
    const normalizedPhone = normalizeMerchantWhatsApp(config.whatsapp)
    if (firstInvalid || !normalizedPhone) {
      document.getElementById(FIELD_IDS[firstInvalid ?? 'whatsapp'])?.focus()
      return
    }
    setSaving(true)
    try {
      const updated = await merchantRepo.update(
        { ...config, whatsapp: normalizedPhone },
        by,
      )
      setConfig(updated)
      toast.success('Configuración guardada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size={32} />
      </div>
    )
  }

  if (!config) {
    return <p className="text-sm text-gray-500 py-10 text-center">Configuración no disponible.</p>
  }

  // Los errores aparecen al intentar guardar y se retiran solos al corregir el campo.
  const errors = attempted ? validateConfig(config) : {}

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">Configuración del aliado</h1>

      <form onSubmit={handleSave} noValidate className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <Field label="Nombre del negocio" id="cfg-name" error={errors.name}>
          <input
            id="cfg-name"
            type="text"
            value={config.name}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
            aria-required="true"
            maxLength={STORE_LIMITS.nameMaxLength}
            {...fieldProps('cfg-name', errors.name)}
          />
        </Field>

        <Field label="WhatsApp del negocio" id="cfg-whatsapp" hint={`Se guarda como: ${formatPhonePretty(config.whatsapp)}`} error={errors.whatsapp}>
          <input
            id="cfg-whatsapp"
            type="tel"
            value={config.whatsapp}
            onChange={(e) => setConfig({ ...config, whatsapp: e.target.value })}
            placeholder="+57 300 000 0000"
            aria-required="true"
            {...fieldProps('cfg-whatsapp', errors.whatsapp)}
          />
        </Field>

        <Field label="Dirección" id="cfg-address" error={errors.address}>
          <textarea
            id="cfg-address"
            value={config.address}
            onChange={(e) => setConfig({ ...config, address: e.target.value })}
            rows={2}
            aria-required="true"
            maxLength={STORE_LIMITS.addressMaxLength}
            {...fieldProps('cfg-address', errors.address, 'resize-none')}
          />
        </Field>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
          >
            <Save className="w-4 h-4" aria-hidden />
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>

      {isDemoMode && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Demo</h2>
          <p className="text-sm text-gray-500 mb-4">
            Limpia pedidos, catálogo editado, horarios y sesiones del demo para arrancar desde los datos de fábrica.
          </p>
          <ResetDemoButton />
        </section>
      )}
    </div>
  )
}

function Field({
  label,
  id,
  hint,
  error,
  children,
}: {
  label: string
  id: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      <FieldError id={id} message={error} />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
