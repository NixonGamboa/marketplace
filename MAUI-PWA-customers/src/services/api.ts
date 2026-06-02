export const BASE_URL = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_URL ?? '/api'

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json() as Promise<T>
}
