/**
 * ME-03 — Lista única de preparación. Una fila por producto con casilla táctil, cantidad o peso pedido, peso
 * real, subtotal y «Falta» en la misma fila. Tocar la fila marca o desmarca; un peso válido guardado marca el
 * producto y borrarlo lo desmarca. Todo se guarda solo, y lo que falla se dice en la fila con «Reintentar».
 * La pestaña de picking queda solo para imprimir y copiar.
 */
import { Check } from 'lucide-react'
import { itemFinalTotal } from '@shared/contracts'
import type { OrderItemDto } from '@shared/contracts'
import type { AdminOrder } from '@/types/adminOrder'
import { formatCop, formatKilos } from './orderPresentation'
import { WEIGHT_HINT, countReady, rowIssue } from './preparation'
import { pickId, weightId } from './rowFocus'
import type { PreparationEditor } from './usePreparationEditor'

interface PreparationChecklistProps {
  order: AdminOrder
  names: Record<string, string>
  editor: PreparationEditor
  /** Quitar y sustituir solo existen en el repository real. */
  canResolveMissing: boolean
  onMissing(itemId: string): void
}

interface RowProps {
  item: OrderItemDto
  name: string
  editor: PreparationEditor
  canResolveMissing: boolean
  onMissing(itemId: string): void
}

function ChecklistRow({ item, name, editor, canResolveMissing, onMissing }: RowProps) {
  const sync = editor.rows[item.id]
  const draft = editor.drafts[item.id]
  const saving = sync?.phase === 'saving'
  const issue = rowIssue(item, draft, sync)
  const picked = item.picked === true
  const variable = item.is_variable_weight === true
  const weightText = draft ?? (item.kilosReal !== undefined ? String(item.kilosReal) : '')
  const invalidWeight = issue === 'invalid_weight'
  const subtotal = variable && item.kilosReal !== undefined ? itemFinalTotal(item) : undefined

  function handleRowTap() {
    // Un peso variable se alista con su peso: tocar la fila sin peso lleva al campo en vez de marcarlo.
    if (variable && item.kilosReal === undefined && !picked) {
      document.getElementById(weightId(item.id))?.focus()
      return
    }
    editor.togglePicked(item.id)
  }

  return (
    <li id={`row-${item.id}`} className={`py-3 transition-opacity ${picked ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <button
          id={pickId(item.id)}
          type="button"
          role="checkbox"
          aria-checked={picked}
          aria-label={name}
          aria-busy={saving}
          disabled={saving}
          onClick={handleRowTap}
          className="flex min-h-12 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          <span
            aria-hidden
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 ${picked ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white'}`}
          >
            {picked && <Check className="h-5 w-5" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-900">
              {name}
              {item.substitutedFor && <span className="ml-2 text-xs font-normal text-indigo-700">Sustituto</span>}
            </span>
            <span className="block text-xs text-gray-600">
              {variable
                ? `Pedido: ${formatKilos(item.kilosRequested ?? 0)} · ${formatCop(item.priceAtMoment)}/kg`
                : `${item.qty} × ${formatCop(item.priceAtMoment)}`}
            </span>
          </span>
        </button>
        {canResolveMissing && (
          <button
            type="button"
            onClick={() => onMissing(item.id)}
            disabled={saving}
            aria-label={`Falta ${name}`}
            className="min-h-10 shrink-0 rounded-lg border border-amber-300 px-3 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
          >
            Falta
          </button>
        )}
      </div>

      {variable && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-11">
          <label htmlFor={weightId(item.id)} className="sr-only">Peso real de {name}</label>
          <div className="relative w-32">
            <input
              id={weightId(item.id)}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Peso real"
              value={weightText}
              aria-invalid={invalidWeight}
              aria-describedby={invalidWeight ? `weight-hint-${item.id}` : undefined}
              onChange={(event) => editor.setDraft(item.id, event.target.value)}
              onBlur={() => editor.commitWeight(item.id)}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
              className={`w-full rounded-lg border px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-1 ${invalidWeight ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:border-indigo-400 focus:ring-indigo-200'}`}
            />
            <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">kg</span>
          </div>
          {subtotal !== undefined && <span className="text-xs text-gray-600">Subtotal: {formatCop(subtotal)}</span>}
        </div>
      )}

      <div className="pl-11" aria-live="polite">
        {saving && <p className="mt-1 text-xs text-gray-500">Guardando…</p>}
        {invalidWeight && <p id={`weight-hint-${item.id}`} className="mt-1 text-xs text-red-700">{WEIGHT_HINT}</p>}
        {issue === 'missing_weight' && !picked && draft === undefined && (
          <p className="mt-1 text-xs text-gray-500">Escribe el peso real para alistarlo.</p>
        )}
        {sync?.phase === 'error' && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            No se guardó · <button type="button" onClick={() => editor.retry(item.id)} className="font-semibold underline">Reintentar</button>
            <span className="block text-red-600">{sync.message}</span>
          </p>
        )}
      </div>
    </li>
  )
}

export function PreparationChecklist({ order, names, editor, canResolveMissing, onMissing }: PreparationChecklistProps) {
  const removedOrReplaced = (order.originalItems ?? []).filter((original) => !order.items.some((item) => item.id === original.id))
  const ready = countReady(order.items)

  return (
    <section aria-labelledby="checklist-heading" className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 id="checklist-heading" className="font-semibold text-gray-800">Lista de preparación</h3>
        <p role="status" className="text-sm font-medium text-gray-700">{ready} de {order.items.length} alistados</p>
      </div>
      <p className="mb-2 text-xs text-gray-500">
        Toca un producto para marcarlo como alistado. Los cambios se guardan solos.
      </p>
      <ul className="divide-y divide-gray-100" role="list">
        {order.items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            name={names[item.id] ?? 'Producto'}
            editor={editor}
            canResolveMissing={canResolveMissing}
            onMissing={onMissing}
          />
        ))}
      </ul>

      {removedOrReplaced.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3" role="list" aria-label="Productos sustituidos o retirados">
          {removedOrReplaced.map((original) => {
            const substitute = order.items.find((item) => item.substitutedFor === original.id)
            return (
              <li key={original.id} className="text-xs text-gray-500">
                <span className="line-through">{original.name ?? 'Producto'}</span>
                {substitute
                  ? ` · Sustituido por ${substitute.name ?? 'otro producto'}`
                  : ' · Retirado: no se empaca ni se cobra'}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
