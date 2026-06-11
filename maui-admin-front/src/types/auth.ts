// Tipos de sesión y autorización del panel admin (sólo demo).
// Source of truth: tech/wip/20260611-evolucion-admin-panel-demo/2-technical/spec.md §5.3

export type Role = 'owner' | 'operator'

export interface AdminUser {
  email: string
  name: string
  role: Role
  merchantId: string
}

export interface Session {
  user: AdminUser
  /** ISO timestamp absoluto; la sesión expira al alcanzar este instante. */
  expiresAt: string
}
