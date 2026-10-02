import type { RateLimitRule } from '../../domain/auth/AuthRepository.js'
import { RateLimitedError } from '../../domain/auth/errors.js'
import type { AuthDeps } from './deps.js'

/** Reserva un intento ANTES del hash costoso; deniega con `RateLimitedError` si no cabe. */
export const reserveAttemptOrThrow = async (
  deps: Pick<AuthDeps, 'repository' | 'clock'>,
  rule: RateLimitRule,
): Promise<void> => {
  const reservation = await deps.repository.reserveAttempt(rule, deps.clock.nowIso())
  if (!reservation.allowed) throw new RateLimitedError(reservation.retryAfterSeconds)
}
