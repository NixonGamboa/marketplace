/**
 * @spec §14, CU-13, US-13, TASK-024, ADR-007
 * Form editable del MerchantConfig (name/whatsapp/address) + sección Demo con ResetDemoButton.
 * `whatsapp` se normaliza a sólo dígitos antes de persistir para que `wa.me/{phone}` lo consuma directo.
 */
import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import type { MerchantConfig } from '@/types/merchant'
import { merchantRepo } from '@/services'
import { useSession } from '@/auth/useSession'
import { useToast } from '@/ui/Toast'
import { Spinner } from '@/ui/Spinner'
import { normalizePhone, formatPhonePretty } from '@/lib/phone'
import { ResetDemoButton } from './ResetDemoButton'

export function ConfigPage() {
  const { session } = useSession()
  const toast = useToast()
  const merchantId = session?.user.merchantId ?? 'mch_lechemiel'
  const by = session?.user.email ?? 'demo'

  const [config, setConfig] = useState<MerchantConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    merchantRepo
      .get(merchantId)
      .then((cfg) => { if (!cancelled) setConfig(cfg) })
      .catch(() => { if (!cancelled) toast.error('No se pudo cargar la configuración') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [merchantId, toast])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    const normalizedPhone = normalizePhone(config.whatsapp)
    if (normalizedPhone.length < 10) {
      toast.error('El teléfono debe tener al menos 10 dígitos')
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

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">Configuración del aliado</h1>

      <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <Field label="Nombre del negocio" id="cfg-name">
          <input
            id="cfg-name"
            type="text"
            value={config.name}
            onChange={(e) => setConfig({ ...config, name: e.target.value })}
            required
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
          />
        </Field>

        <Field label="WhatsApp del negocio" id="cfg-whatsapp" hint={`Se guarda como: ${formatPhonePretty(config.whatsapp)}`}>
          <input
            id="cfg-whatsapp"
            type="tel"
            value={config.whatsapp}
            onChange={(e) => setConfig({ ...config, whatsapp: e.target.value })}
            placeholder="+57 300 000 0000"
            required
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
          />
        </Field>

        <Field label="Dirección" id="cfg-address">
          <textarea
            id="cfg-address"
            value={config.address}
            onChange={(e) => setConfig({ ...config, address: e.target.value })}
            rows={2}
            required
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 resize-none"
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

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-1">Demo</h2>
        <p className="text-sm text-gray-500 mb-4">
          Limpia pedidos, catálogo editado, horarios y sesiones del demo para arrancar desde los datos de fábrica.
        </p>
        <ResetDemoButton />
      </section>
    </div>
  )
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string
  id: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
