import { SignJWT, jwtVerify } from 'jose'
import { ENTITY_ID_PATTERN } from '../../../../shared/contracts/index.js'
import { SESSION_TTL_SECONDS } from '../../domain/auth/policy.js'
import type { SessionClaims, SessionTokenService } from '../../domain/auth/ports.js'

const ALGORITHM = 'HS256'
const REQUIRED_CLAIMS = ['iss', 'aud', 'sub', 'jti', 'iat', 'exp']
const MAX_TOKEN_LENGTH = 2048
/** Tolerancia para `iat` ligeramente en el futuro por desfase de reloj entre instancias. */
const IAT_SKEW_SECONDS = 60

export interface JoseSessionTokenSettings {
  secret: Uint8Array
  issuer: string
  audience: string
}

/**
 * JWT HS256 exclusivamente. Claims: iss, aud, sub (cuenta), jti (sesión), iat, exp.
 * El token solo identifica cuenta+sesión; autoridad (rol/tienda/estado) se lee de la BD.
 */
export class JoseSessionTokenService implements SessionTokenService {
  constructor(private readonly settings: JoseSessionTokenSettings) {}

  sign(claims: SessionClaims): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setIssuer(this.settings.issuer)
      .setAudience(this.settings.audience)
      .setSubject(claims.accountId)
      .setJti(claims.sessionId)
      .setIssuedAt(claims.issuedAt)
      .setExpirationTime(claims.expiresAt)
      .sign(this.settings.secret)
  }

  async verify(token: string, now: Date): Promise<SessionClaims | null> {
    if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null
    try {
      const { payload } = await jwtVerify(token, this.settings.secret, {
        algorithms: [ALGORITHM],
        issuer: this.settings.issuer,
        audience: this.settings.audience,
        typ: 'JWT',
        requiredClaims: REQUIRED_CLAIMS,
        currentDate: now,
      })

      const { sub, jti, iat, exp, aud } = payload
      if (typeof sub !== 'string' || !ENTITY_ID_PATTERN.test(sub)) return null
      if (typeof jti !== 'string' || !ENTITY_ID_PATTERN.test(jti)) return null
      // Segundos enteros y representables: se rechazan fraccionarios e inseguros (> 2^53).
      if (typeof iat !== 'number' || typeof exp !== 'number') return null
      if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp)) return null
      if (aud !== this.settings.audience) return null

      const nowSeconds = Math.floor(now.getTime() / 1000)
      if (iat > nowSeconds + IAT_SKEW_SECONDS) return null
      if (exp <= iat || exp - iat > SESSION_TTL_SECONDS) return null

      return { accountId: sub, sessionId: jti, issuedAt: iat, expiresAt: exp }
    } catch {
      return null
    }
  }
}
