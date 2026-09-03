export interface Clock {
  now(): Date
  nowIso(): string
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowIso: () => new Date().toISOString(),
}
