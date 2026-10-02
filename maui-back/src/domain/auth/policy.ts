import type { RateLimitRule } from './AuthRepository.js'

/** Vida máxima de una sesión (JWT y fila en BD). */
export const SESSION_TTL_SECONDS = 8 * 60 * 60

type RatePolicy = Pick<RateLimitRule, 'limit' | 'windowSeconds'>

/** Intentos de login por identificador (teléfono/email) y ventana. */
export const LOGIN_ATTEMPT_POLICY: RatePolicy = { limit: 10, windowSeconds: 15 * 60 }

/**
 * Cota global de logins, evaluada ANTES del bucket por identificador y del hash. Sin ella,
 * quien cambia de teléfono/email en cada petición evita el límite por identificador y fuerza
 * scrypt sin tope (Origin no autentica a clientes no-browser). No se reinicia tras un login
 * exitoso.
 *
 * LIMITACIÓN (hasta T-06, que podrá afinar por IP confiable): la cuota es compartida; un
 * atacante puede agotarla y bloquear temporalmente el login de TODOS, y cada login legítimo
 * (también los exitosos) consume cupo.
 */
export const LOGIN_GLOBAL_POLICY: RatePolicy = { limit: 60, windowSeconds: 15 * 60 }
export const LOGIN_GLOBAL_BUCKET = 'login:global'

/** Registros por teléfono. */
export const REGISTER_PHONE_POLICY: RatePolicy = { limit: 3, windowSeconds: 60 * 60 }

/**
 * Cota global conservadora de registros: no confiamos en la IP del cliente (cabeceras
 * reenviables), así que hasta T-06 un bucket único acota el abuso masivo.
 */
export const REGISTER_GLOBAL_POLICY: RatePolicy = { limit: 30, windowSeconds: 60 * 60 }
export const REGISTER_GLOBAL_BUCKET = 'register:global'
