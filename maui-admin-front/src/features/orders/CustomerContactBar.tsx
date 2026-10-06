/**
 * @spec ADR-007, §12, TASK-017 — Barra de contacto con el cliente.
 * Usa SÓLO order.customerPhone — nunca merchant.whatsapp (ADR-007).
 * Si customerPhone está ausente muestra un hint informativo.
 * Contactar es siempre una acción secundaria (ME-03): la acción principal del pedido vive en el pie.
 */
import { Phone, Copy } from 'lucide-react'
import type { OrderStatus } from '@/types/orderService'
import { normalizePhone, formatPhonePretty } from '@/lib/phone'
import { copyToClipboard } from '@/lib/clipboard'
import { useToast } from '@/ui/Toast'
import { messageForStatus } from './orderPresentation'
import { WhatsAppLink } from './WhatsAppLink'

interface CustomerContactBarProps {
  customerName: string
  customerPhone?: string
  /** Referencia comercial («Pedido #001248»), la misma que ve el cliente en todos los canales. */
  reference: string
  status: OrderStatus
}

const SECONDARY_LINK =
  'inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50'

export function CustomerContactBar({ customerName, customerPhone, reference, status }: CustomerContactBarProps) {
  const toast = useToast()
  const normalized = customerPhone ? normalizePhone(customerPhone) : ''
  const pretty = customerPhone ? formatPhonePretty(customerPhone) : ''

  async function handleCopyPhone() {
    if (!normalized) return
    const ok = await copyToClipboard(normalized)
    if (ok) toast.success('Teléfono copiado')
    else toast.error('No se pudo copiar')
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <p className="font-semibold text-gray-900">{customerName}</p>
        {customerPhone
          ? <p className="mt-0.5 text-sm text-gray-600">{pretty}</p>
          : <p className="mt-0.5 text-xs italic text-gray-400">Sin teléfono en el pedido</p>}
      </div>

      {customerPhone ? (
        <div className="flex flex-wrap gap-2">
          <WhatsAppLink phone={normalized} message={messageForStatus(status, reference)} />
          <a href={`tel:${normalized}`} className={SECONDARY_LINK}>
            <Phone className="h-4 w-4" aria-hidden />
            Llamar
          </a>
          <button type="button" onClick={handleCopyPhone} className={SECONDARY_LINK}>
            <Copy className="h-4 w-4" aria-hidden />
            Copiar teléfono
          </button>
        </div>
      ) : null}
    </div>
  )
}
