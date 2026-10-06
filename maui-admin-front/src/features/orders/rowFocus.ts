/** Ids de los controles de cada fila de preparación y salto de foco hacia la que impide avanzar. */
import type { RowIssue } from './preparation'

export const pickId = (itemId: string): string => `pick-${itemId}`
export const weightId = (itemId: string): string => `weight-${itemId}`

/** Lleva el foco a la fila pendiente: al peso si es lo que falta, a la casilla en los demás casos. */
export function focusRow(itemId: string, issue: RowIssue): void {
  const needsWeight = issue === 'missing_weight' || issue === 'invalid_weight' || issue === 'unsaved_weight'
  const target = document.getElementById(needsWeight ? weightId(itemId) : pickId(itemId)) ?? document.getElementById(pickId(itemId))
  if (!target) return
  target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  target.focus()
}
