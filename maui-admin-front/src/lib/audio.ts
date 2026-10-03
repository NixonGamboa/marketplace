/** Tono local sin assets; cada carga exige gesto explícito para activar WebAudio. */
let audio: AudioContext | null = null
let enabled = false

export async function enableSound(): Promise<void> {
  audio ??= new AudioContext()
  await audio.resume()
  enabled = true
}

export function disableSound(): void {
  enabled = false
  void audio?.suspend().catch(() => undefined)
}

export const isSoundEnabled = (): boolean => enabled

/** Una restricción de audio nunca impide presentar ni seguir el pedido. */
export function playNewOrderSound(): void {
  if (!enabled || !audio || audio.state !== 'running') return
  try {
    const now = audio.currentTime
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
    oscillator.connect(gain)
    gain.connect(audio.destination)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    oscillator.start(now)
    oscillator.stop(now + 0.25)
  } catch {
    // La alerta visual sigue disponible si el navegador rechaza la reproducción.
  }
}
