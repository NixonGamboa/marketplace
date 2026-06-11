// Configuración del aliado (negocio) en el panel admin.
// Source of truth: tech/wip/20260611-evolucion-admin-panel-demo/2-technical/spec.md §5.3

export interface MerchantConfig {
  merchantId: string
  name: string
  /** Teléfono WhatsApp del negocio, normalizado a sólo dígitos con prefijo país. */
  whatsapp: string
  address: string
  updatedAt: string
}
