/** Puertos tipados de criptografía/tokens: los casos de uso no conocen `node:crypto` ni `jose`. */

export interface PasswordHasher {
  /** Devuelve un hash autodescriptivo con sal aleatoria. */
  hash(password: string): Promise<string>
  /** `false` ante contraseña errónea o hash almacenado malformado. Nunca lanza por eso. */
  verify(password: string, storedHash: string): Promise<boolean>
  /** Mismo costo que `verify`, contra un hash ficticio: cuenta inexistente no se distingue por tiempo. */
  verifyUnknown(password: string): Promise<void>
}

/** Claims de la sesión en segundos epoch. Rol y tienda NO viajan en el token. */
export interface SessionClaims {
  accountId: string
  sessionId: string
  issuedAt: number
  expiresAt: number
}

export interface SessionTokenService {
  sign(claims: SessionClaims): Promise<string>
  /** `null` ante cualquier fallo (firma, algoritmo, claims, expiración). */
  verify(token: string, now: Date): Promise<SessionClaims | null>
}

export interface AuthIdGenerator {
  accountId(): string
  sessionId(): string
}

/** Deriva claves de bucket opacas: teléfonos/emails no se guardan en claro en la tabla de límites. */
export interface BucketKeyer {
  key(scope: string, value: string): string
}
