import { useEffect, useState } from 'react'
import type { ReceiptResult } from '@shared/receipts'
import { realReceiptService, type ReceiptService } from '@/services/realReceiptService'

interface Props {
  orderId: string
  service?: ReceiptService
  /** Reloj del seguimiento activo: actualiza también el texto relativo del comprobante abierto. */
  refreshToken?: number
}
type LoadState = { orderId: string; result?: ReceiptResult; failed?: boolean }
/** Punto de integración real para detalle/seguimiento; no consume datos de la demo. */
export function RealOrderReceipt({ orderId, service = realReceiptService, refreshToken }: Props) {
  const [state, setState] = useState<LoadState>({ orderId })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    service.load(orderId, controller.signal).then(
      (result) => { if (active) setState({ orderId, result }) },
      () => { if (active) setState({ orderId, failed: true }) },
    )
    return () => { active = false; controller.abort() }
  }, [orderId, service, attempt, refreshToken])
  const current = state.orderId === orderId ? state : { orderId }
  if (current.failed) return <section aria-label="Comprobante del pedido">
    <p role="alert">No se pudo consultar el pedido. Verifica tu sesión y conexión.</p>
    <button type="button" onClick={() => { setState({ orderId }); setAttempt((value) => value + 1) }}>Reintentar</button>
  </section>
  if (!current.result) return <p role="status">Cargando comprobante…</p>
  const { receipt, contact, contactUnavailable } = current.result
  return <section aria-label="Comprobante del pedido">
    <h2>Comprobante del pedido</h2>
    {receipt.rows.map((row, index) => <p key={index}>{row}</p>)}
    {contact
      ? <a href={contact.url} target="_blank" rel="noopener noreferrer">{contact.label}</a>
      : <p>{contactUnavailable ?? 'Contacto por WhatsApp no disponible.'}</p>}
  </section>
}
