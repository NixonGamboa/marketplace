// Helper para simular latencia de red en los mock repositories (300–800ms).
// Si el browser está bajo test (vitest / jsdom) usamos delay determinista corto
// para no ralentizar la suite.

const isTestEnv = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.VITEST)

export function randomDelay(minMs = 300, maxMs = 800): Promise<void> {
  if (isTestEnv) return Promise.resolve()
  const ms = Math.floor(minMs + Math.random() * (maxMs - minMs))
  return new Promise((resolve) => setTimeout(resolve, ms))
}
