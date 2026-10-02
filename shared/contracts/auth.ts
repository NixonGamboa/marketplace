import { z } from 'zod'
import { canonicalMobileSchema, entityIdSchema, isoUtcSchema, mobileInputSchema } from './common.js'

/**
 * Contrato de cuentas y sesiones (T-05). Sin dependencias de runtime: lo consumen
 * PWA, admin y backend. La sesión viaja solo en cookie HttpOnly; ningún DTO contiene
 * tokens, hashes ni secretos.
 */

export const ACCOUNT_ROLES = ['customer', 'owner', 'operator'] as const
export type AccountRole = (typeof ACCOUNT_ROLES)[number]

export const STAFF_ROLES = ['owner', 'operator'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const PASSWORD_LIMITS = { min: 12, max: 128 } as const
export const ACCOUNT_NAME_MAX_LENGTH = 80
export const EMAIL_MAX_LENGTH = 254

export const accountNameSchema = z.string().trim().min(2).max(ACCOUNT_NAME_MAX_LENGTH)

/** Contraseña nueva (registro/alta de staff): aplica la política de longitud. */
export const newPasswordSchema = z.string().min(PASSWORD_LIMITS.min).max(PASSWORD_LIMITS.max)

/** Contraseña en login: solo acota el tamaño, sin revelar la política. */
export const loginPasswordSchema = z.string().min(1).max(PASSWORD_LIMITS.max)

/** Email normalizado (minúsculas, sin espacios): clave única de staff. */
export const emailInputSchema = z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH)

/**
 * Registro público: SOLO cliente. `.strict()` rechaza `role`, `storeId` y cualquier
 * otro campo, así que el body nunca puede escalar privilegios.
 */
export const registerRequestSchema = z
  .object({
    name: accountNameSchema,
    phone: z.string().max(32).pipe(mobileInputSchema),
    password: newPasswordSchema,
  })
  .strict()

export type RegisterRequest = z.infer<typeof registerRequestSchema>

/** Login con esquema explícito: `method` decide el identificador (email = staff, phone = cliente). */
export const loginRequestSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('email'), email: emailInputSchema, password: loginPasswordSchema }).strict(),
  z
    .object({
      method: z.literal('phone'),
      phone: z.string().max(32).pipe(mobileInputSchema),
      password: loginPasswordSchema,
    })
    .strict(),
])

export type LoginRequest = z.infer<typeof loginRequestSchema>

/** El teléfono del cliente es un dato de contacto NO verificado (no hay OTP/WhatsApp en esta entrega). */
export const customerAccountDtoSchema = z
  .object({
    id: entityIdSchema,
    role: z.literal('customer'),
    name: accountNameSchema,
    phone: canonicalMobileSchema,
    phoneVerified: z.literal(false),
  })
  .strict()

export const staffAccountDtoSchema = z
  .object({
    id: entityIdSchema,
    role: z.enum(STAFF_ROLES),
    name: accountNameSchema,
    email: z.string().email().max(EMAIL_MAX_LENGTH),
    storeId: entityIdSchema,
  })
  .strict()

export const accountDtoSchema = z.union([customerAccountDtoSchema, staffAccountDtoSchema])

export type AccountDto = z.infer<typeof accountDtoSchema>

/** Respuesta de register/login/session. El token NUNCA forma parte del JSON. */
export const authSessionResponseSchema = z
  .object({
    account: accountDtoSchema,
    expiresAt: isoUtcSchema,
  })
  .strict()

export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>
