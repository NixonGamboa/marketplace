/**
 * T-17 / ME-03 — Diálogo de producto faltante, abierto desde «Falta» en la fila de la lista de preparación.
 * Sustituir o quitar viaja como un cambio atómico con la versión que el personal ve; ante un 409 el cambio se
 * reintenta solo si no tocó el mismo producto, y si no, el diálogo queda abierto con lo elegido y el aviso.
 * «Hablé con el cliente» es una declaración del personal (no envía mensajes) y es obligatoria con `call_me`;
 * registrarla no resuelve la fila: solo aplica la decisión del cliente (qué sustituto o si se retira).
 */
import { useEffect, useState } from 'react'
import { Phone } from 'lucide-react'
import type { OrderItemChange, OrderItemDto } from '@shared/contracts'
import type { AdminOrder } from '@/types/adminOrder'
import type { Product } from '@/types/catalog'
import { catalogRepo } from '@/services'
import { errorMessage } from '@/lib/errorMessage'
import { normalizePhone } from '@/lib/phone'
import { Modal } from '@/ui/Modal'
import { WhatsAppLink } from './WhatsAppLink'
import type { PreparationEditor } from './usePreparationEditor'

type Decision = 'substitute' | 'remove'

interface MissingItemDialogProps {
  order: AdminOrder
  item: OrderItemDto
  name: string
  /** Referencia comercial del pedido para el mensaje de contacto. */
  reference: string
  editor: Pick<PreparationEditor, 'apply' | 'latest'>
  onClose(): void
  onApplied(decision: Decision): void
  loadProducts?: () => Promise<Product[]>
}

const defaultLoadProducts = (): Promise<Product[]> => catalogRepo.listProducts()

/** `active` solo existe en el DTO de personal; un producto oculto no se ofrece como sustituto. */
const canSubstituteWith = (product: Product): boolean =>
  product.inStock && !('active' in product && product.active === false)

export function MissingItemDialog({
  order,
  item,
  name,
  reference,
  editor,
  onClose,
  onApplied,
  loadProducts = defaultLoadProducts,
}: MissingItemDialogProps) {
  const mustContact = order.substitutionPreference === 'call_me'
  const substitutionAllowed = order.substitutionPreference !== 'remove'
  const [decision, setDecision] = useState<Decision>(substitutionAllowed ? 'substitute' : 'remove')
  const [products, setProducts] = useState<Product[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [productId, setProductId] = useState('')
  const [amount, setAmount] = useState('1')
  const [contacted, setContacted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Pedido en que el personal basó su decisión; tras un conflicto pasa a ser el que ya se le muestra.
  const [base, setBase] = useState(() => editor.latest())

  useEffect(() => {
    if (decision !== 'substitute' || products !== null) return
    let active = true
    loadProducts().then(
      (loaded) => { if (active) setProducts(loaded) },
      (failure: unknown) => { if (active) setLoadError(errorMessage(failure, 'No se pudo cargar el catálogo.')) },
    )
    return () => { active = false }
  }, [decision, products, loadProducts])

  const inOrder = new Set(order.items.map((candidate) => candidate.id))
  const candidates = (products ?? []).filter((product) => canSubstituteWith(product) && !inOrder.has(product.id))
  const selected = candidates.find((product) => product.id === productId)
  const phone = order.customerPhone ? normalizePhone(order.customerPhone) : ''

  function buildChange(): OrderItemChange | string {
    if (mustContact && !contacted) return 'Confirma que hablaste con el cliente antes de cambiar el pedido.'
    const contact = contacted ? { customerContacted: true as const } : {}
    if (decision === 'remove') return { type: 'remove', itemId: item.id, ...contact }
    if (!selected) return 'Elige el producto sustituto.'
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) return selected.is_variable_weight ? 'Indica los kilos solicitados.' : 'Indica la cantidad.'
    return selected.is_variable_weight
      ? { type: 'substitute', itemId: item.id, productId: selected.id, qty: 1, kilosRequested: value, ...contact }
      : { type: 'substitute', itemId: item.id, productId: selected.id, qty: value, ...contact }
  }

  async function handleConfirm() {
    const change = buildChange()
    if (typeof change === 'string') {
      setError(change)
      return
    }
    setBusy(true)
    setError(null)
    const outcome = await editor.apply(change, base)
    setBusy(false)
    if (outcome.ok) {
      onApplied(decision)
      return
    }
    // Lo elegido se conserva: el personal revisa lo que cambió y vuelve a aplicar.
    if (outcome.conflict) setBase(editor.latest())
    setError(outcome.message)
  }

  return (
    <Modal open onClose={() => { if (!busy) onClose() }} title="Producto faltante">
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          Falta <strong>{name}</strong>. Elige qué hacer; el total final se recalcula en el servidor.
        </p>

        {mustContact && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>El cliente pidió que lo llames antes de cambiar nada. Aplica solo lo que él decida.</p>
            {phone && (
              <div className="mt-2 flex flex-wrap gap-2">
                <WhatsAppLink
                  phone={phone}
                  message={`${reference}: no tenemos ${name}. ¿Prefieres un sustituto o lo quitamos del pedido?`}
                  label="Escribir por WhatsApp"
                />
                <a
                  href={`tel:${phone}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:border-gray-400"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  Llamar
                </a>
              </div>
            )}
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Decisión</legend>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="missing-decision"
              checked={decision === 'substitute'}
              disabled={!substitutionAllowed}
              onChange={() => setDecision('substitute')}
            />
            Sustituir por otro producto
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" name="missing-decision" checked={decision === 'remove'} onChange={() => setDecision('remove')} />
            Quitar del pedido
          </label>
          {!substitutionAllowed && (
            <p className="text-xs text-gray-500">El cliente pidió quitar lo que falte, sin reemplazo.</p>
          )}
        </fieldset>

        {decision === 'substitute' && (
          <>
            {loadError ? (
              <p role="alert" className="text-sm text-red-700">{loadError}</p>
            ) : products === null ? (
              <p role="status" className="text-sm text-gray-500">Cargando catálogo…</p>
            ) : (
              <div>
                <label htmlFor="substitute-product" className="mb-1 block text-sm font-medium text-gray-700">
                  Producto sustituto
                </label>
                <select
                  id="substitute-product"
                  value={productId}
                  onChange={(event) => { setProductId(event.target.value); setAmount('1') }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Elige un producto…</option>
                  {candidates.map((product) => (
                    <option key={product.id} value={product.id}>{product.name} ({product.unit})</option>
                  ))}
                </select>
                {candidates.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">No hay productos disponibles para sustituir.</p>
                )}
              </div>
            )}
            {selected && (
              <div>
                <label htmlFor="substitute-amount" className="mb-1 block text-sm font-medium text-gray-700">
                  {selected.is_variable_weight ? 'Kilos solicitados' : 'Cantidad'}
                </label>
                <input
                  id="substitute-amount"
                  type="number"
                  min={selected.is_variable_weight ? '0.001' : '1'}
                  step={selected.is_variable_weight ? '0.001' : '1'}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">El sustituto entra a la lista sin marcar, para alistarlo.</p>
              </div>
            )}
          </>
        )}

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={contacted} onChange={(event) => setContacted(event.target.checked)} className="mt-0.5" />
          <span>Hablé con el cliente{mustContact ? ' (obligatorio: pidió que lo llames)' : ''}</span>
        </label>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Aplicar cambio'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
