import type { VercelRequest, VercelResponse } from '@vercel/node'
import { config } from '../maui-back/src/shared/config.js'

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({
    status: 'ok',
    env: config.NODE_ENV,
    driver: config.DB_DRIVER,
    time: new Date().toISOString(),
  })
}
