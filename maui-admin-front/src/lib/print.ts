/**
 * @spec §13, TASK-018 — Helper de impresión.
 * Delega a window.print(); el CSS @media print en index.css se encarga
 * de ocultar el chrome (sidebar/header) y mostrar sólo el área imprimible.
 */
export function triggerPrint(): void {
  if (typeof window !== 'undefined') {
    window.print()
  }
}
