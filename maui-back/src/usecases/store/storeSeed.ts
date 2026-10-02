import type { StoreSettingsDto } from '../../../../shared/contracts/index.js'
import { DEFAULT_STORE_ID } from '../../domain/orders/Order.js'

/**
 * Datos base de la tienda de test. Provienen de los mocks vigentes: horario del admin
 * (`storeStatusSeed`), nombre/dirección del aliado (`merchantSeed`), envío/umbral y franjas
 * de la PWA (`config/app.ts`) y el corte "Pedidos antes de las 5 pm". Son semilla de
 * servidor: ninguna app los lee en ejecución. Sin WhatsApp real conocido, `contactPhone` es
 * `null` (el relleno `573000000000` no es un contacto).
 */
export const STORE_SEED_ID = DEFAULT_STORE_ID

const weekday = { open: '08:00', close: '20:00', closed: false }

export const STORE_SEED_SETTINGS: StoreSettingsDto = {
  name: 'Leche y Miel',
  contactPhone: null,
  address: 'Calle 5 # 4-12, Dolores, Tolima',
  timeZone: 'America/Bogota',
  weeklySchedule: {
    mon: weekday,
    tue: weekday,
    wed: weekday,
    thu: weekday,
    fri: weekday,
    sat: weekday,
    sun: { open: '09:00', close: '14:00', closed: false },
  },
  scheduleOverride: 'auto',
  delivery: {
    enabled: true,
    shippingCost: 3000,
    freeShippingThreshold: 30000,
    cutoff: '17:00',
    coverageNote: 'Solo hay cobertura en el casco urbano de Dolores',
  },
  timeSlots: [
    { id: 'morning', enabled: true, start: '08:00', end: '12:00' },
    { id: 'afternoon', enabled: true, start: '12:00', end: '17:00' },
    { id: 'asap', enabled: true },
  ],
}
