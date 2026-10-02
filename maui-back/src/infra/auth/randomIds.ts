import { createHmac, randomBytes } from 'node:crypto'
import type { AuthIdGenerator, BucketKeyer } from '../../domain/auth/ports.js'

/** IDs opacos aleatorios (CSPRNG). Cumplen `ENTITY_ID_PATTERN` y caben en 64 caracteres. */
export class RandomAuthIds implements AuthIdGenerator {
  /** 128 bits. */
  accountId(): string {
    return `acc_${randomBytes(16).toString('base64url')}`
  }

  /** 256 bits: es el `jti` y la clave de la sesión persistente. */
  sessionId(): string {
    return `ses_${randomBytes(32).toString('base64url')}`
  }
}

/** HMAC con una subclave derivada del secreto: la tabla de límites no guarda teléfonos/emails en claro. */
export class HmacBucketKeyer implements BucketKeyer {
  private readonly subkey: Buffer

  constructor(secret: Uint8Array) {
    this.subkey = createHmac('sha256', secret).update('maui:auth:rate-limit:v1').digest()
  }

  key(scope: string, value: string): string {
    const digest = createHmac('sha256', this.subkey).update(`${scope}\0${value}`).digest('base64url')
    return `${scope}:${digest}`
  }
}
