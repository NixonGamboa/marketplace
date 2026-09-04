import type { VercelResponse } from '@vercel/node'
import { DomainError, NotFoundError, ValidationError } from '../../src/shared/errors.js'
import { logger } from '../../src/shared/logger.js'

export const ok = <T>(res: VercelResponse, body: T, status = 200): void => {
  res.status(status).json(body)
}

export const fail = (res: VercelResponse, err: unknown): void => {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.code, message: err.message, issues: err.issues })
    return
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof DomainError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  logger.error({ err }, 'Unhandled error')
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' })
}
