/**
 * @spec ADR-007, §13, TASK-017 — Enlace de WhatsApp al cliente.
 * Recibe `phone` como prop normalizado (sólo dígitos con prefijo país).
 * NO asume origen del número: el caller decide qué phone pasar.
 * Nunca usa merchant.whatsapp — eso es responsabilidad de ConfigPage.
 * Es una acción de contacto: siempre secundaria, nunca compite con la acción principal del pedido.
 */
import { MessageCircle } from 'lucide-react'

interface WhatsAppLinkProps {
  phone: string
  message: string
  label?: string
}

export function WhatsAppLink({ phone, message, label = 'WhatsApp' }: WhatsAppLinkProps) {
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
    >
      <MessageCircle className="h-4 w-4" aria-hidden />
      {label}
    </a>
  )
}
