import type { VercelRequest, VercelResponse } from '@vercel/node'
import { vi } from 'vitest'

export function request(method: string): VercelRequest {
  return { method } as VercelRequest
}

export function response() {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() }
  res.status.mockReturnValue(res)
  return { res, http: res as unknown as VercelResponse }
}
