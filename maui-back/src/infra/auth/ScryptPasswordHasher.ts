import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { PasswordHasher } from '../../domain/auth/ports.js'

/**
 * scrypt asíncrono (threadpool de libuv, no bloquea el event loop).
 * Formato: `scrypt$1$<N>$<r>$<p>$<salt base64url>$<hash base64url>`.
 */
export const SCRYPT_PARAMS = { N: 32768, r: 8, p: 3 } as const

const FORMAT_VERSION = '1'
const KEY_LENGTH = 32
const SALT_LENGTH = 16

/** Límites al LEER un hash almacenado: un registro manipulado no puede forzar memoria/CPU arbitraria. */
const LIMITS = {
  minLog2N: 14,
  maxLog2N: 16,
  r: 8,
  minP: 1,
  maxP: 4,
  minSalt: 16,
  maxSalt: 64,
  maxStoredLength: 256,
} as const

interface ScryptSettings {
  N: number
  r: number
  p: number
}

interface ParsedHash extends ScryptSettings {
  salt: Buffer
  hash: Buffer
}

const BASE64URL = /^[A-Za-z0-9_-]+$/
const DECIMAL = /^[1-9]\d{0,6}$/

const deriveKey = (password: string, salt: Buffer, settings: ScryptSettings, keyLength: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      keyLength,
      // Node exige maxmem > 128·N·r; se deja el doble de margen.
      { N: settings.N, r: settings.r, p: settings.p, maxmem: 256 * settings.N * settings.r },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })

const decodeCanonical = (value: string): Buffer | null => {
  if (!BASE64URL.test(value)) return null
  const decoded = Buffer.from(value, 'base64url')
  return decoded.toString('base64url') === value ? decoded : null
}

const isPowerOfTwoWithin = (value: number, minLog2: number, maxLog2: number): boolean =>
  Number.isInteger(Math.log2(value)) && Math.log2(value) >= minLog2 && Math.log2(value) <= maxLog2

/** Validación estricta: formato, versión, parámetros acotados y longitudes exactas. */
export const parseStoredHash = (stored: string): ParsedHash | null => {
  if (stored.length > LIMITS.maxStoredLength) return null
  const parts = stored.split('$')
  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== FORMAT_VERSION) return null

  const [, , rawN, rawR, rawP, rawSalt, rawHash] = parts
  if (!rawN || !rawR || !rawP || !rawSalt || !rawHash) return null
  if (!DECIMAL.test(rawN) || !DECIMAL.test(rawR) || !DECIMAL.test(rawP)) return null

  const N = Number(rawN)
  const r = Number(rawR)
  const p = Number(rawP)
  if (!isPowerOfTwoWithin(N, LIMITS.minLog2N, LIMITS.maxLog2N)) return null
  if (r !== LIMITS.r || p < LIMITS.minP || p > LIMITS.maxP) return null

  const salt = decodeCanonical(rawSalt)
  const hash = decodeCanonical(rawHash)
  if (!salt || salt.length < LIMITS.minSalt || salt.length > LIMITS.maxSalt) return null
  if (!hash || hash.length !== KEY_LENGTH) return null

  return { N, r, p, salt, hash }
}

const formatHash = (settings: ScryptSettings, salt: Buffer, key: Buffer): string =>
  ['scrypt', FORMAT_VERSION, settings.N, settings.r, settings.p, salt.toString('base64url'), key.toString('base64url')].join('$')

/** Sal fija solo para el hash ficticio: nunca se compara su resultado. */
const DUMMY_SALT = Buffer.alloc(SALT_LENGTH, 1)

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH)
    const key = await deriveKey(password, salt, SCRYPT_PARAMS, KEY_LENGTH)
    return formatHash(SCRYPT_PARAMS, salt, key)
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const parsed = parseStoredHash(storedHash)
    if (!parsed) {
      // Hash corrupto: mismo costo para no distinguirlo por tiempo.
      await this.verifyUnknown(password)
      return false
    }
    const actual = await deriveKey(password, parsed.salt, parsed, parsed.hash.length)
    return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash)
  }

  async verifyUnknown(password: string): Promise<void> {
    await deriveKey(password, DUMMY_SALT, SCRYPT_PARAMS, KEY_LENGTH)
  }
}
