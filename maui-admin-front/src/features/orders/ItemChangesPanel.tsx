/**
 * T-17 (modo real) — Quitar o sustituir ítems durante la preparación.
 * Cada cambio viaja en un PATCH atómico con la versión que el personal está viendo; si otro
 * cambio ganó (409) se avisa y la página recarga el pedido en vez de pisarlo.
 * La casilla «Hablé con el cliente» es una declaración del personal (no envía mensajes) y es
 * obligatoria cuando el cliente pidió «avisar antes de cambiar nada» (`call_me`).
 */
import { useEffect, useState } from 'react'
import type { OrderItemChange } from '@shared/contracts'
import type { AdminOrder } from '@/types/adminOrder'
import type { Product } from '@/types/catalog'
import { catalogRepo, serverOrderRepo } from '@/services'
import { errorMessage, isConflict } from '@/lib/errorMessage'
import { Modal } from '@/ui/Modal'
import { useToast } from '@/ui/Toast'

type Pending = { type: 'remove' | 'substitute'; itemId: string }

interface ItemChangesPanelProps {
  order: AdminOrder
  /** Nombre visible por ítem (snapshot del pedido o catálogo). */
  names: Record<string, string>
  onApplied(order: AdminOrder): void
  /** El servidor rechazó la versión: la página debe recargar el pedido vigente. */
  onConflict(): void
  loadProducts?: () => Promise<Product[]>
  applyChanges?: (orderId: string, changes: OrderItemChange[], expectedVersion: number) => Promise<AdminOrder>
}

const defaultLoadProducts = (): Promise<Product[]> => catalogRepo.listProducts()
const defaultApplyChanges: NonNullable<ItemChangesPanelProps['applyChanges']> = (orderId, changes, version) =>
  serverOrderRepo.changeItems(orderId, changes, version)

/** `active` solo existe en el DTO de personal; un producto oculto no se ofrece como sustituto. */
const canSubstituteWith = (product: Product): boolean =>
  product.inStock && !('active' in product && product.active === false)

export function ItemChangesPanel({
  order,
  names,
  onApplied,
  onConflict,
  loadProducts = defaultLoadProducts,
  applyChanges = defaultApplyChanges,
}: ItemChangesPanelProps) {
  const toast = useToast()
  const [pending, setPending] = useState<Pending | null>(null)
  const [products, setProducts] = useState<Product[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [productId, setProductId] = useState('')
  const [amount, setAmount] = useState('1')
  const [contacted, setContacted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mustContact = order.substitutionPreference === 'call_me'
  const item = pending ? order.items.find((candidate) => candidate.id === pending.itemId) : undefined

  useEffect(() => {
    if (pending?.type !== 'substitute' || products !== null) return
    let active = true
    loadProducts().then(
      (loaded) => { if (active) setProducts(loaded) },
      (failure: unknown) => { if (active) setLoadError(errorMessage(failure, 'No se pudo cargar el catálogo.')) },
    )
    return () => { active = false }
  }, [pending, products, loadProducts])

  function open(next: Pending) {
    setPending(next)
    setProductId('')
    setAmount('1')
    setContacted(false)
    setError(null)
    setLoadError(null)
  }

  function close() {
    if (!busy) setPending(null)
  }

  const inOrder = new Set(order.items.map((candidate) => candidate.id))
  const candidates = (products ?? []).filter((product) => canSubstituteWith(product) && !inOrder.has(product.id))
  const selected = candidates.find((product) => product.id === productId)

  function buildChange(): OrderItemChange | string {
    if (!pending) return 'Elige un ítem.'
    if (mustContact && !contacted) return 'Confirma que hablaste con el cliente antes de cambiar el pedido.'
    const contact = contacted ? { customerContacted: true as const } : {}
    if (pending.type === 'remove') return { type: 'remove', itemId: pending.itemId, ...contact }
    if (!selected) return 'Elige el producto sustituto.'
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) return selected.is_variable_weight ? 'Indica los kilos solicitados.' : 'Indica la cantidad.'
    return selected.is_variable_weight
      ? { type: 'substitute', itemId: pending.itemId, productId: selected.id, qty: 1, kilosRequested: value, ...contact }
      : { type: 'substitute', itemId: pending.itemId, productId: selected.id, qty: value, ...contact }
  }

  async function handleConfirm() {
    const change = buildChange()
    if (typeof change === 'string') {
      setError(change)
      return
    }
    if (order.version === undefined) {
      setError('El pedido no trae versión; recárgalo antes de modificarlo.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await applyChanges(order.orderId, [change], order.version)
      setPending(null)
      toast.success(change.type === 'remove' ? 'Ítem quitado' : 'Ítem sustituido')
      onApplied(updated)
    } catch (failure) {
      if (isConflict(failure)) {
        setPending(null)
        toast.error('El pedido cambió mientras lo editabas. Se cargó la versión vigente.')
        onConflict()
      } else {
        setError(errorMessage(failure, 'No se pudo aplicar el cambio.'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="changes-heading" className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 id="changes-heading" className="font-semibold text-gray-800 mb-1">Cambios de ítems</h3>
      <p className="text-xs text-gray-500 mb-3">
        {mustContact
          ? 'El cliente pidió que lo llames antes de cambiar nada.'
          : order.substitutionPreference === 'similar'
            ? 'El cliente acepta un producto similar.'
            : 'El cliente prefiere quitar lo que falte.'}
      </p>
      <ul className="divide-y divide-gray-100" role="list">
        {order.items.map((candidate) => (
          <li key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-sm text-gray-800">
              {names[candidate.id] ?? candidate.id}
              {candidate.substitutedFor && <span className="ml-2 text-xs text-indigo-700">Sustituto</span>}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => open({ type: 'substitute', itemId: candidate.id })}
                className="px-3 py-1 border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-medium rounded-lg transition"
                aria-label={`Sustituir ${names[candidate.id] ?? candidate.id}`}
              >
                Sustituir
              </button>
              <button
                type="button"
                onClick={() => open({ type: 'remove', itemId: candidate.id })}
                className="px-3 py-1 border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium rounded-lg transition"
                aria-label={`Quitar ${names[candidate.id] ?? candidate.id}`}
              >
                Quitar
              </button>
            </span>
          </li>
        ))}
      </ul>

      <Modal
        open={pending !== null}
        onClose={close}
        title={pending?.type === 'remove' ? 'Quitar ítem' : 'Sustituir ítem'}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            {pending?.type === 'remove' ? 'Se quitará' : 'Se sustituirá'}{' '}
            <strong>{item ? names[item.id] ?? item.id : ''}</strong>. El total final se recalcula en el servidor.
          </p>

          {pending?.type === 'substitute' && (
            <>
              {loadError ? (
                <p role="alert" className="text-sm text-red-700">{loadError}</p>
              ) : products === null ? (
                <p role="status" className="text-sm text-gray-500">Cargando catálogo…</p>
              ) : (
                <div>
                  <label htmlFor="substitute-product" className="block text-sm font-medium text-gray-700 mb-1">
                    Producto sustituto
                  </label>
                  <select
                    id="substitute-product"
                    value={productId}
                    onChange={(event) => { setProductId(event.target.value); setAmount('1') }}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
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
                  <label htmlFor="substitute-amount" className="block text-sm font-medium text-gray-700 mb-1">
                    {selected.is_variable_weight ? 'Kilos solicitados' : 'Cantidad'}
                  </label>
                  <input
                    id="substitute-amount"
                    type="number"
                    min={selected.is_variable_weight ? '0.001' : '1'}
                    step={selected.is_variable_weight ? '0.001' : '1'}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              )}
            </>
          )}

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={contacted}
              onChange={(event) => setContacted(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              Hablé con el cliente{mustContact ? ' (obligatorio: pidió que lo llames)' : ''}
            </span>
          </label>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium rounded-lg transition"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
            >
              {busy ? 'Guardando…' : 'Aplicar cambio'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
