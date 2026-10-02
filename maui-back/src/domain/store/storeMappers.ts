import { storeDtoSchema, type StoreDto } from '../../../../shared/contracts/index.js'
import type { StoreSettings } from './StoreSettings.js'
import { evaluateStoreAvailability } from './storeRules.js'

/** Proyección pública por lista blanca, con la disponibilidad calculada en `now`. Sin `version`. */
export const toStoreDto = (settings: StoreSettings, now: Date): StoreDto =>
  storeDtoSchema.parse({
    storeId: settings.id,
    name: settings.name,
    contactPhone: settings.contactPhone,
    address: settings.address,
    timeZone: settings.timeZone,
    weeklySchedule: settings.weeklySchedule,
    scheduleOverride: settings.scheduleOverride,
    delivery: settings.delivery,
    timeSlots: settings.timeSlots,
    availability: evaluateStoreAvailability(settings, now),
    updatedAt: settings.updatedAt,
  })
