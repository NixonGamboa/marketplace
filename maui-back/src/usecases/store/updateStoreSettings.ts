import {
  issuesFromZodError,
  storeSettingsSchema,
  updateStoreSettingsRequestSchema,
} from '../../../../shared/contracts/index.js'
import { StoreConflictError } from '../../domain/store/errors.js'
import type { StoreRepository } from '../../domain/store/StoreRepository.js'
import type { StoreSettings } from '../../domain/store/StoreSettings.js'
import { ownedStoreOf, type StoreActor } from '../../domain/store/storeAccess.js'
import type { Clock } from '../../shared/clock.js'
import { ValidationError } from '../../shared/errors.js'
import { getStoreSettings } from './getStore.js'

export interface UpdateStoreSettingsDeps {
  store: StoreRepository
  clock: Clock
}

/**
 * Edición parcial por el owner de su propia tienda (la de la sesión, nunca la del body).
 * Rol → validación → lectura → fusión validada → UPDATE condicionado por versión.
 */
export const updateStoreSettings = async (
  deps: UpdateStoreSettingsDeps,
  actor: StoreActor,
  input: unknown,
): Promise<StoreSettings> => {
  const storeId = ownedStoreOf(actor)

  const parsed = updateStoreSettingsRequestSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Invalid store settings', issuesFromZodError(parsed.error))
  const { delivery, ...patch } = parsed.data

  const current = await getStoreSettings(deps, storeId)
  const merged = storeSettingsSchema.safeParse({
    name: patch.name ?? current.name,
    contactPhone: patch.contactPhone === undefined ? current.contactPhone : patch.contactPhone,
    address: patch.address ?? current.address,
    timeZone: current.timeZone,
    weeklySchedule: patch.weeklySchedule ?? current.weeklySchedule,
    scheduleOverride: patch.scheduleOverride ?? current.scheduleOverride,
    delivery: { ...current.delivery, ...delivery },
    timeSlots: patch.timeSlots ?? current.timeSlots,
  })
  if (!merged.success) throw new ValidationError('Invalid store settings', issuesFromZodError(merged.error))

  const updated = await deps.store.updateSettings(
    { ...current, ...merged.data, version: current.version + 1, updatedAt: deps.clock.nowIso() },
    current.version,
  )
  if (!updated) throw new StoreConflictError()
  return updated
}
