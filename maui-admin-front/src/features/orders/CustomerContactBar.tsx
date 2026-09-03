/**
 * @spec ADR-007, §12, TASK-017 — Barra de contacto con el cliente.
 * Usa SÓLO order.customerPhone — nunca merchant.whatsapp (ADR-007).
 * Si customerPhone está ausente muestra un hint informativo.
 */
import { Phone, Copy } from 'lucide-react'
import type { OrderStatus } from '@/types/orderService'
import { normalizePhone, formatPhonePretty } from '@/lib/phone'
import { copyToClipboard } from '@/lib/clipboard'
import { useToast } from '@/ui/Toast'
import { WhatsAppLink } from './WhatsAppLink'

/** Mensaje de WhatsApp adaptado al estado del pedido (ADR-007). */
export function messageForStatus(status: OrderStatus, orderId: string): string {
  switch (status) {
    case 'received':
      return `Tu pedido ${orderId} fue recibido. Si necesito consultarte alguna sustitución te aviso.`
    case 'confirmed':
      return `Tu pedido ${orderId} fue confirmado y estamos alistándolo.`
    case 'preparing':
      return `Tu pedido ${orderId} ya está en preparación.`
    case 'ready':
      return `Tu pedido ${orderId} está listo para recoger o ser enviado.`
    case 'delivered':
      return `Tu pedido ${orderId} fue entregado. ¡Gracias por tu compra!`
    default:
      return `Actualización sobre tu pedido ${orderId}.`
  }
}

interface CustomerContactBarProps {
  customerName: string
  customerPhone?: string
  orderId: string
  status: OrderStatus
}

export function CustomerContactBar({
  customerName,
  customerPhone,
  orderId,
  status,
}: CustomerContactBarProps) {
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
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <div className="mb-3">
        <p className="font-semibold text-gray-900">{customerName}</p>
        {customerPhone
          ? <p className="text-sm text-gray-600 mt-0.5">{pretty}</p>
          : <p className="text-xs text-gray-400 mt-0.5 italic">Sin teléfono en el pedido</p>
        }
      </div>

      {customerPhone ? (
        <div className="flex flex-wrap gap-2">
          {/* CTA primario: WhatsApp al cliente */}
          <WhatsAppLink
            phone={normalized}
            message={messageForStatus(status, orderId)}
            label="WhatsApp"
          />

          {/* CTA primario: llamar */}
          <a
            href={`tel:${normalized}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition"
          >
            <Phone className="w-4 h-4" aria-hidden />
            Llamar
          </a>

          {/* CTA secundario: copiar teléfono */}
          <button
            type="button"
            onClick={handleCopyPhone}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 hover:border-gray-400 text-gray-700 text-sm font-medium rounded-xl transition"
          >
            <Copy className="w-4 h-4" aria-hidden />
            Copiar teléfono
          </button>
        </div>
      ) : null}
    </div>
  )
}
