/**
 * Reglas puras de la lista de preparación (ME-03): peso escrito, qué falta para pasar a «Listo» y cuándo
 * un cambio propio puede reaplicarse sobre una versión más nueva del pedido sin pisar a otro operador.
 */
import { ORDER_LIMITS, isGramPrecision, type OrderItemChange, type OrderItemDto } from '@shared/contracts'
import type { AdminOrder } from '@/types/adminOrder'

// ── Peso escrito ────────────────────────────────────────────────────────────

export type WeightDraft =
  | { kind: 'empty' }
  | { kind: 'valid'; kilos: number }
  | { kind: 'invalid' }

/** Acepta coma o punto decimal; un peso válido es positivo, de hasta 3 decimales y dentro de los topes del contrato. */
export function parseWeightDraft(text: string): WeightDraft {
  const normalized = text.trim().replace(',', '.')
  if (normalized === '') return { kind: 'empty' }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(normalized)) return { kind: 'invalid' }
  const kilos = Number(normalized)
  const valid = Number.isFinite(kilos) && kilos >= ORDER_LIMITS.minKilos && kilos <= ORDER_LIMITS.maxKilos && isGramPrecision(kilos)
  return valid ? { kind: 'valid', kilos } : { kind: 'invalid' }
}

export const WEIGHT_HINT = `Ingresa un peso entre ${ORDER_LIMITS.minKilos} y ${ORDER_LIMITS.maxKilos} kg, con hasta 3 decimales.`

/** Cambio a guardar al salir del campo de peso; `null` si lo escrito ya es lo guardado o no se puede guardar. */
export function weightChangeFor(item: OrderItemDto, draft: WeightDraft): OrderItemChange | null {
  if (draft.kind === 'valid') return draft.kilos === item.kilosReal ? null : { type: 'weight', itemId: item.id, kilosReal: draft.kilos }
  if (draft.kind === 'empty') return item.kilosReal === undefined ? null : { type: 'weight', itemId: item.id, kilosReal: null }
  return null
}

// ── Pendientes para pasar a «Listo» ─────────────────────────────────────────

export type RowSync =
  | { phase: 'saving' }
  | { phase: 'error'; message: string; change: OrderItemChange }

export type RowIssue = 'saving' | 'failed' | 'invalid_weight' | 'unsaved_weight' | 'missing_weight' | 'unpicked'

/** Línea alistada de verdad: marcada y, si es de peso variable, con su peso real guardado. */
export const isItemReady = (item: OrderItemDto): boolean =>
  item.picked === true && !(item.is_variable_weight === true && item.kilosReal === undefined)

/** Motivo por el que la línea impide pasar a «Listo»; `null` si está alistada, guardada y sin nada en curso. */
export function rowIssue(item: OrderItemDto, draft: string | undefined, sync: RowSync | undefined): RowIssue | null {
  if (sync?.phase === 'saving') return 'saving'
  if (sync?.phase === 'error') return 'failed'
  if (draft !== undefined) {
    const parsed = parseWeightDraft(draft)
    if (parsed.kind === 'invalid') return 'invalid_weight'
    if (weightChangeFor(item, parsed) !== null) return 'unsaved_weight'
  }
  if (isItemReady(item)) return null
  return item.is_variable_weight === true && item.kilosReal === undefined ? 'missing_weight' : 'unpicked'
}

export interface PendingRow {
  itemId: string
  issue: RowIssue
}

export function pendingRows(
  items: readonly OrderItemDto[],
  drafts: Readonly<Record<string, string>>,
  sync: Readonly<Record<string, RowSync>>,
): PendingRow[] {
  return items.flatMap((item) => {
    const issue = rowIssue(item, drafts[item.id], sync[item.id])
    return issue === null ? [] : [{ itemId: item.id, issue }]
  })
}

export const countReady = (items: readonly OrderItemDto[]): number => items.filter(isItemReady).length

// ── Reaplicar un cambio propio sobre una versión más nueva ──────────────────

export type RebaseVerdict =
  | { kind: 'safe' }
  /** El pedido ya refleja lo que se iba a guardar: no hace falta escribir. */
  | { kind: 'applied' }
  | { kind: 'conflict'; reason: 'status' | 'structure' | 'item' }

const sameLine = (a: OrderItemDto, b: OrderItemDto): boolean =>
  a.picked === b.picked && a.kilosReal === b.kilosReal && a.qty === b.qty
  && a.kilosRequested === b.kilosRequested && a.priceAtMoment === b.priceAtMoment

const sameStructure = (a: AdminOrder, b: AdminOrder): boolean =>
  a.items.length === b.items.length && a.items.every((item, index) => item.id === b.items[index]?.id)

function alreadyApplied(change: OrderItemChange, current: OrderItemDto | undefined): boolean {
  if (change.type === 'pick') return (current?.picked === true) === change.picked
  if (change.type === 'weight') return current?.kilosReal === (change.kilosReal ?? undefined)
  return false
}

/**
 * Compara el pedido en que el operador basó su cambio (`base`) con el más reciente (`latest`). Solo cambió
 * OTRO ítem → `safe` (se puede reintentar con la versión nueva). Cambió el mismo ítem, la estructura del
 * pedido (quitados o sustitutos) o el estado → conflicto: nunca se pisa en silencio lo que hizo otra persona.
 */
export function rebaseVerdict(base: AdminOrder, latest: AdminOrder, change: OrderItemChange): RebaseVerdict {
  if (latest.status !== 'preparing') return { kind: 'conflict', reason: 'status' }
  if (!sameStructure(base, latest)) return { kind: 'conflict', reason: 'structure' }
  const before = base.items.find((item) => item.id === change.itemId)
  const now = latest.items.find((item) => item.id === change.itemId)
  if (before && now && sameLine(before, now)) return { kind: 'safe' }
  return alreadyApplied(change, now) ? { kind: 'applied' } : { kind: 'conflict', reason: 'item' }
}

export const CONFLICT_MESSAGES: Record<'status' | 'structure' | 'item', string> = {
  status: 'El pedido ya no está en preparación. Revisa su estado actual.',
  structure: 'Otra persona cambió los productos del pedido. Revisa la lista y vuelve a intentarlo.',
  item: 'Este producto lo cambió otra persona. Revisa su valor actual y vuelve a intentarlo.',
}
