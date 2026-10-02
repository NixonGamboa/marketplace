import { describe, expect, it } from 'vitest'
import {
  SCRYPT_PARAMS,
  ScryptPasswordHasher,
  parseStoredHash,
} from '../../src/infra/auth/ScryptPasswordHasher.js'

const salt = (bytes = 16) => Buffer.alloc(bytes, 7).toString('base64url')
const digest = (bytes = 32) => Buffer.alloc(bytes, 9).toString('base64url')
const stored = (parts: Partial<Record<'version' | 'N' | 'r' | 'p' | 'salt' | 'hash', string | number>> = {}) =>
  ['scrypt', parts.version ?? 1, parts.N ?? 32768, parts.r ?? 8, parts.p ?? 3, parts.salt ?? salt(), parts.hash ?? digest()].join('$')

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher()

  it('usa scrypt N=32768 r=8 p=3, sal de 16 bytes y formato versionado', async () => {
    expect(SCRYPT_PARAMS).toEqual({ N: 32768, r: 8, p: 3 })
    const hash = await hasher.hash('clave-segura-123')
    const parsed = parseStoredHash(hash)
    expect(hash.startsWith('scrypt$1$32768$8$3$')).toBe(true)
    expect(parsed).toMatchObject({ N: 32768, r: 8, p: 3 })
    expect(parsed?.salt.length).toBe(16)
    expect(parsed?.hash.length).toBe(32)
    expect(hash).not.toContain('clave-segura-123')
  }, 20_000)

  it('verifica la contraseña correcta, rechaza la errónea y genera sales distintas', async () => {
    const first = await hasher.hash('clave-segura-123')
    const second = await hasher.hash('clave-segura-123')
    expect(first).not.toBe(second)
    expect(await hasher.verify('clave-segura-123', first)).toBe(true)
    expect(await hasher.verify('clave-segura-124', first)).toBe(false)
    expect(await hasher.verify('', first)).toBe(false)
  }, 20_000)

  it('normaliza Unicode (NFKC): equivalentes canónicos validan igual', async () => {
    const hash = await hasher.hash('contraseña-ñandú-1')
    expect(await hasher.verify('contraseña-ñandú-1'.normalize('NFD'), hash)).toBe(true)
  }, 20_000)

  it('un hash almacenado malformado devuelve false sin lanzar', async () => {
    await expect(hasher.verify('clave-segura-123', 'no-es-un-hash')).resolves.toBe(false)
    await expect(hasher.verify('clave-segura-123', stored({ N: 2 ** 20 }))).resolves.toBe(false)
  }, 20_000)

  it('verifyUnknown completa sin resultado ni error', async () => {
    await expect(hasher.verifyUnknown('lo-que-sea-123456')).resolves.toBeUndefined()
  }, 20_000)
})

describe('parseStoredHash (formato y límites estrictos)', () => {
  it('acepta un hash válido y parámetros dentro de los límites', () => {
    expect(parseStoredHash(stored())).not.toBeNull()
    expect(parseStoredHash(stored({ N: 16384, p: 1 }))).not.toBeNull()
    expect(parseStoredHash(stored({ N: 65536, p: 4 }))).not.toBeNull()
    expect(parseStoredHash(stored({ salt: salt(64) }))).not.toBeNull()
  })

  it.each([
    ['versión desconocida', stored({ version: 2 })],
    ['N demasiado grande', stored({ N: 131072 })],
    ['N demasiado pequeño', stored({ N: 8192 })],
    ['N no potencia de 2', stored({ N: 30000 })],
    ['N con ceros a la izquierda', stored({ N: '032768' })],
    ['N no numérico', stored({ N: '0x8000' })],
    ['r distinto de 8', stored({ r: 16 })],
    ['p = 0', stored({ p: 0 })],
    ['p demasiado grande', stored({ p: 5 })],
    ['sal corta', stored({ salt: salt(8) })],
    ['sal demasiado larga', stored({ salt: salt(65) })],
    ['hash de longitud incorrecta', stored({ hash: digest(31) })],
    ['hash con relleno base64 (no canónico)', `${stored()}=`],
    ['base64url con caracteres inválidos', stored({ hash: `${digest().slice(0, 42)}+` })],
    ['partes de más', `${stored()}$extra`],
    ['partes de menos', 'scrypt$1$32768$8$3$abc'],
    ['prefijo distinto', stored().replace('scrypt', 'argon2')],
    ['vacío', ''],
    ['demasiado largo', `${stored()}${'a'.repeat(300)}`],
  ])('rechaza %s', (_case, value) => {
    expect(parseStoredHash(value)).toBeNull()
  })

  it('rechaza una sal con bits de relleno alterados (no canónica)', () => {
    // 16 bytes → 22 caracteres; el último solo usa 2 bits, así que 'B' (bits extra en 1) no es canónico.
    expect(parseStoredHash(stored({ salt: `${'A'.repeat(21)}B` }))).toBeNull()
    expect(parseStoredHash(stored({ salt: `${'A'.repeat(21)}A` }))).not.toBeNull()
  })
})
