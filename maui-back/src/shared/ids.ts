import { ulid } from 'ulid'

export const newId = (): string => ulid()

export const isValidId = (id: string): boolean =>
  typeof id === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)
