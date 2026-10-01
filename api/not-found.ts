import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jsonResponse } from './_lib/response.js'

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store')
  jsonResponse(res, { error: 'NOT_FOUND', message: 'Ruta API no encontrada' }, 404, req.method === 'HEAD')
}
