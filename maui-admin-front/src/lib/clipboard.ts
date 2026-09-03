/**
 * @spec §13, TASK-018 — Helper de clipboard con fallback gracioso.
 * Retorna true si la copia tuvo éxito, false si el API no está disponible
 * o el usuario denegó el permiso.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined') return false

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fallback si el permiso fue denegado
    }
  }

  // Fallback mediante execCommand (deprecated pero funciona en contextos sin HTTPS)
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
