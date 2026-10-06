import type { PaymentMethod } from '@shared/contracts'
import { paymentMethodLabel, paymentOnReceiptMessage } from '@shared/receipts'
import { useCheckoutStore } from './checkoutStore'

const methods: { value: PaymentMethod; description: string }[] = [
  { value: 'cash', description: 'Pagas en efectivo.' },
  { value: 'qr', description: 'Escaneas el código QR del negocio.' },
  { value: 'bre_b', description: 'Usas la llave Bre-B del negocio.' },
]

export function PaymentSelector({ disabled }: { disabled: boolean }) {
  const method = useCheckoutStore((state) => state.paymentMethod)
  const setMethod = useCheckoutStore((state) => state.setPaymentMethod)
  const mode = useCheckoutStore((state) => state.deliveryMode)
  return <fieldset disabled={disabled} aria-describedby="payment-note" className="rounded-2xl border border-brand-border bg-white p-5 shadow-card">
    <legend className="px-1 text-sm font-semibold text-brand-dark">¿Cómo quieres pagar?</legend>
    <div className="space-y-2">
      {methods.map(({ value, description }) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-brand-border px-3 py-3 focus-within:ring-2 focus-within:ring-brand-primary">
        <input type="radio" name="payment-method" value={value} checked={method === value} onChange={() => setMethod(value)} className="h-5 w-5 accent-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary" />
        <span><span className="block text-sm font-semibold text-brand-dark">{paymentMethodLabel(value)}</span><span className="block text-xs text-brand-muted">{description}</span></span>
      </label>)}
    </div>
    <p id="payment-note" className="mt-3 text-xs text-brand-muted">{paymentOnReceiptMessage(mode ?? 'delivery')} Si llevas productos por peso, el valor puede ajustarse.</p>
  </fieldset>
}
