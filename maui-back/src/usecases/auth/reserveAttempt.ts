import type { AuthRepository, RateLimitRule } from '../../domain/auth/AuthRepository.js'
import { RateLimitedError } from '../../domain/auth/errors.js'
import type { Clock } from '../../shared/clock.js'

export interface AttemptLimiterDeps {
  repository: Pick<AuthRepository, 'reserveAttempt'>
  clock: Clock
}

/** Reserva un intento ANTES del trabajo costoso; deniega con `RateLimitedError` si no cabe. */
export const reserveAttemptOrThrow = async (deps: AttemptLimiterDeps, rule: RateLimitRule): Promise<void> => {
  const reservation = await deps.repository.reserveAttempt(rule, deps.clock.nowIso())
  if (!reservation.allowed) throw new RateLimitedError(reservation.retryAfterSeconds)
}
