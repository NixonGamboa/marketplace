/**
 * Edición de la lista de preparación (ME-03): guarda marcas y pesos al instante, de uno en uno, y conserva
 * lo que el operador escribió pase lo que pase. Un cambio solo se refleja cuando el servidor lo confirma.
 *
 * Concurrencia: la API versiona el pedido completo, así que dos operadores que tocan productos distintos
 * chocan igualmente (409). Ante un 409 se relee el pedido; si solo cambiaron OTROS productos se reintenta
 * con la versión nueva, y si cambió el mismo producto, la estructura o el estado se muestra el conflicto
 * sin escribir y el borrador queda en pantalla.
 *
 * Un peso escrito conserva el pedido en que EMPEZÓ a escribirse (`draftBases`): lo que otra persona haga
 * sobre ese producto mientras tanto, aunque el sondeo lo traiga antes de salir del campo, se detecta como
 * conflicto en vez de tomarse como punto de partida. Solo «Reintentar» adopta una base nueva.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OrderItemChange } from '@shared/contracts'
import type { AdminOrder } from '@/types/adminOrder'
import { errorMessage, isConflict } from '@/lib/errorMessage'
import { latestOrder } from '@/lib/orderPolling'
import {
  CONFLICT_MESSAGES,
  parseWeightDraft,
  pendingRows,
  rebaseVerdict,
  weightChangeFor,
  type PendingRow,
  type RowSync,
} from './preparation'

/** Un 409 propio se reintenta tras releer; más de dos seguidos indican una disputa que debe resolver una persona. */
const MAX_REBASES = 2

export interface PreparationApi {
  changeItems(orderId: string, changes: OrderItemChange[], expectedVersion: number | undefined): Promise<AdminOrder>
  getById(orderId: string): Promise<AdminOrder>
}

export type ApplyOutcome = { ok: true } | { ok: false; message: string; conflict: boolean }

/**
 * Resultado interno de una operación. En éxito lleva el pedido que la propia operación reconoció (la respuesta
 * del servidor, o el estado en que el cambio ya estaba aplicado): es el punto de partida correcto para lo que se
 * siga escribiendo, a diferencia del pedido más reciente, que el sondeo pudo adelantar con cambios ajenos.
 */
type Execution = { ok: true; snapshot: AdminOrder } | Extract<ApplyOutcome, { ok: false }>

export interface PreparationEditor {
  /** Último pedido conocido (el más reciente entre el sondeo y las respuestas propias). */
  latest(): AdminOrder
  drafts: Readonly<Record<string, string>>
  rows: Readonly<Record<string, RowSync>>
  pending: PendingRow[]
  /** Lo que impide cerrar la edición AHORA (borradores, guardados en curso o fallidos), sin esperar a un render. */
  pendingNow(): PendingRow[]
  setDraft(itemId: string, text: string): void
  /** Al salir del campo de peso: guarda lo escrito si es válido y distinto de lo guardado. */
  commitWeight(itemId: string): void
  /** Tocar la fila: marca o desmarca. */
  togglePicked(itemId: string): void
  /** Acción explícita: vuelve a intentar el cambio adoptando el pedido actual como base. */
  retry(itemId: string): void
  /** Cambio estructural desde el diálogo de faltantes; la fila queda «guardando» y devuelve el resultado. */
  apply(change: OrderItemChange, base: AdminOrder): Promise<ApplyOutcome>
}

interface Operation {
  change: OrderItemChange
  /** Pedido en que se basó el operador al decidir el cambio. */
  base: AdminOrder
}

export function usePreparationEditor(
  order: AdminOrder,
  onOrder: (order: AdminOrder) => void,
  api: PreparationApi,
): PreparationEditor {
  // Las referencias son la fuente de verdad (se leen en eventos y en la cola); el estado solo las refleja para pintar.
  const [drafts, setDraftsState] = useState<Record<string, string>>({})
  const [rows, setRowsState] = useState<Record<string, RowSync>>({})
  const draftsRef = useRef<Record<string, string>>({})
  const rowsRef = useRef<Record<string, RowSync>>({})
  const draftBases = useRef(new Map<string, AdminOrder>())
  /** Productos que salieron del campo mientras su guardado seguía en vuelo: se guardan al terminar. */
  const deferredCommits = useRef(new Set<string>())
  const inflight = useRef(new Set<string>())
  const latestRef = useRef(order)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const mounted = useRef(true)
  const apiRef = useRef(api)
  const onOrderRef = useRef(onOrder)

  useEffect(() => {
    apiRef.current = api
    onOrderRef.current = onOrder
  })
  useEffect(() => { latestRef.current = latestOrder(latestRef.current, order) }, [order])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const writeDrafts = useCallback((next: Record<string, string>) => {
    draftsRef.current = next
    if (mounted.current) setDraftsState(next)
  }, [])

  const writeRows = useCallback((next: Record<string, RowSync>) => {
    rowsRef.current = next
    if (mounted.current) setRowsState(next)
  }, [])

  const itemOf = useCallback((itemId: string) => latestRef.current.items.find((item) => item.id === itemId), [])

  const publish = useCallback((next: AdminOrder) => {
    latestRef.current = latestOrder(latestRef.current, next)
    if (mounted.current) onOrderRef.current(next)
  }, [])

  const setRow = useCallback((itemId: string, sync: RowSync | null) => {
    const { [itemId]: _previous, ...rest } = rowsRef.current
    writeRows(sync === null ? rest : { ...rest, [itemId]: sync })
  }, [writeRows])

  const dropDraft = useCallback((itemId: string) => {
    draftBases.current.delete(itemId)
    deferredCommits.current.delete(itemId)
    const { [itemId]: _dropped, ...rest } = draftsRef.current
    writeDrafts(rest)
  }, [writeDrafts])

  const execute = useCallback(async ({ change, base }: Operation): Promise<Execution> => {
    let rereads = 0
    for (;;) {
      const current = latestRef.current
      const verdict = rebaseVerdict(base, current, change)
      if (verdict.kind === 'applied') return { ok: true, snapshot: current }
      if (verdict.kind === 'conflict') return { ok: false, conflict: true, message: CONFLICT_MESSAGES[verdict.reason] }
      try {
        const updated = await apiRef.current.changeItems(current.orderId, [change], current.version)
        publish(updated)
        return { ok: true, snapshot: updated }
      } catch (failure) {
        if (!isConflict(failure) || rereads >= MAX_REBASES) {
          return { ok: false, conflict: isConflict(failure), message: errorMessage(failure, 'No se pudo guardar.') }
        }
        rereads += 1
        try {
          publish(await apiRef.current.getById(current.orderId))
        } catch (rereadFailure) {
          return { ok: false, conflict: false, message: errorMessage(rereadFailure, 'No se pudo actualizar el pedido.') }
        }
      }
    }
  }, [publish])

  /** Serializa los guardados: la versión de cada uno sale de la respuesta del anterior. */
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task)
    queue.current = run.catch(() => undefined)
    return run
  }, [])

  /** `submit` y `commitWeight` se llaman entre sí (guardado diferido): el vínculo pasa por esta referencia. */
  const commitRef = useRef<(itemId: string) => void>(() => undefined)

  const submit = useCallback((operation: Operation) => {
    const { change } = operation
    const { itemId } = change
    inflight.current.add(itemId)
    setRow(itemId, { phase: 'saving' })
    void enqueue(() => execute(operation)).then((outcome) => {
      inflight.current.delete(itemId)
      if (!outcome.ok) {
        deferredCommits.current.delete(itemId)
        setRow(itemId, { phase: 'error', message: outcome.message, change })
        return
      }
      setRow(itemId, null)
      if (change.type !== 'weight') return
      const text = draftsRef.current[itemId]
      if (text === undefined) return
      const typed = parseWeightDraft(text)
      const saved = typed.kind === 'empty' ? change.kilosReal === null : typed.kind === 'valid' && typed.kilos === change.kilosReal
      if (saved) {
        dropDraft(itemId)
        return
      }
      // Se escribió más mientras se guardaba: el borrador sigue y parte de lo que esta operación reconoció. Tomar
      // `latestRef` adoptaría un cambio ajeno que el sondeo publicó antes de que llegara la respuesta propia.
      draftBases.current.set(itemId, outcome.snapshot)
      if (deferredCommits.current.delete(itemId)) commitRef.current(itemId)
    })
  }, [dropDraft, enqueue, execute, setRow])

  const commitWeight = useCallback((itemId: string) => {
    const item = itemOf(itemId)
    const text = draftsRef.current[itemId]
    if (!item || text === undefined) return
    if (inflight.current.has(itemId)) {
      // Salió del campo con un guardado en vuelo: se reevalúa al terminar, sin perder lo escrito.
      deferredCommits.current.add(itemId)
      return
    }
    const draft = parseWeightDraft(text)
    const change = weightChangeFor(item, draft)
    if (change !== null) {
      // Base de la primera edición, no la de ahora: el sondeo pudo traer un cambio ajeno mientras se escribía.
      submit({ change, base: draftBases.current.get(itemId) ?? latestRef.current })
    } else if (draft.kind !== 'invalid') {
      // Lo escrito ya es lo guardado: no queda nada pendiente ni un error que arrastrar.
      dropDraft(itemId)
      if (rowsRef.current[itemId]?.phase === 'error') setRow(itemId, null)
    }
  }, [dropDraft, itemOf, setRow, submit])

  useEffect(() => { commitRef.current = commitWeight })

  const setDraft = useCallback((itemId: string, text: string) => {
    if (!draftBases.current.has(itemId)) draftBases.current.set(itemId, latestRef.current)
    writeDrafts({ ...draftsRef.current, [itemId]: text })
  }, [writeDrafts])

  const togglePicked = useCallback((itemId: string) => {
    const item = itemOf(itemId)
    if (!item || inflight.current.has(itemId)) return
    submit({ change: { type: 'pick', itemId, picked: item.picked !== true }, base: latestRef.current })
  }, [itemOf, submit])

  const retry = useCallback((itemId: string) => {
    const sync = rowsRef.current[itemId]
    const item = itemOf(itemId)
    if (sync?.phase !== 'error' || inflight.current.has(itemId)) return
    // Un peso escrito después del fallo manda sobre el cambio que falló; reintentar adopta el pedido actual como base.
    const text = draftsRef.current[itemId]
    const change = sync.change.type === 'weight' && item && text !== undefined
      ? weightChangeFor(item, parseWeightDraft(text))
      : sync.change
    if (change === null) {
      setRow(itemId, null)
      return
    }
    if (draftsRef.current[itemId] !== undefined) draftBases.current.set(itemId, latestRef.current)
    submit({ change, base: latestRef.current })
  }, [itemOf, setRow, submit])

  const apply = useCallback(async (change: OrderItemChange, base: AdminOrder): Promise<ApplyOutcome> => {
    const { itemId } = change
    inflight.current.add(itemId)
    setRow(itemId, { phase: 'saving' })
    try {
      const outcome = await enqueue(() => execute({ change, base }))
      return outcome.ok ? { ok: true } : outcome
    } finally {
      inflight.current.delete(itemId)
      setRow(itemId, null)
    }
  }, [enqueue, execute, setRow])

  const pendingNow = useCallback(
    () => pendingRows(latestRef.current.items, draftsRef.current, rowsRef.current),
    [],
  )

  return {
    latest: () => latestRef.current,
    drafts,
    rows,
    pending: pendingRows(order.items, drafts, rows),
    pendingNow,
    setDraft,
    commitWeight,
    togglePicked,
    retry,
    apply,
  }
}
