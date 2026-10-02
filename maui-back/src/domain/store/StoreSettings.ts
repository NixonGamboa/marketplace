import type { StoreSettingsDto } from '../../../../shared/contracts/index.js'

/**
 * Configuración persistida de una tienda. `version` sube en cada escritura y condiciona el
 * UPDATE: dos ediciones concurrentes no se pisan en silencio.
 */
export interface StoreSettings extends StoreSettingsDto {
  id: string
  version: number
  /** ISO UTC. */
  createdAt: string
  updatedAt: string
}
