import { and, eq } from 'drizzle-orm'
import { normalizeIsoUtc, storeSettingsSchema } from '../../../../shared/contracts/index.js'
import { StorePersistenceError } from '../../domain/store/errors.js'
import type { StoreRepository } from '../../domain/store/StoreRepository.js'
import type { StoreSettings } from '../../domain/store/StoreSettings.js'
import type { Db } from './client.js'
import { storesTable } from './schema.js'

type StoreRow = typeof storesTable.$inferSelect

/** JSONB y columnas se validan con el contrato: una fila malformada no sale como configuración. */
const toSettings = (row: StoreRow): StoreSettings => {
  const parsed = storeSettingsSchema.safeParse({
    name: row.name,
    contactPhone: row.contactPhone,
    address: row.address,
    timeZone: row.timeZone,
    weeklySchedule: row.weeklySchedule,
    scheduleOverride: row.scheduleOverride,
    delivery: {
      enabled: row.deliveryEnabled,
      shippingCost: row.shippingCost,
      freeShippingThreshold: row.freeShippingThreshold,
      cutoff: row.deliveryCutoff,
      coverageNote: row.coverageNote,
    },
    timeSlots: row.timeSlots,
  })
  if (!parsed.success) throw new Error('Invalid store row')
  return {
    ...parsed.data,
    id: row.id,
    version: row.version,
    createdAt: normalizeIsoUtc(row.createdAt),
    updatedAt: normalizeIsoUtc(row.updatedAt),
  }
}

const toRow = (settings: StoreSettings): typeof storesTable.$inferInsert => ({
  id: settings.id,
  name: settings.name,
  contactPhone: settings.contactPhone,
  address: settings.address,
  timeZone: settings.timeZone,
  weeklySchedule: settings.weeklySchedule,
  scheduleOverride: settings.scheduleOverride,
  deliveryEnabled: settings.delivery.enabled,
  shippingCost: settings.delivery.shippingCost,
  freeShippingThreshold: settings.delivery.freeShippingThreshold,
  deliveryCutoff: settings.delivery.cutoff,
  coverageNote: settings.delivery.coverageNote,
  timeSlots: settings.timeSlots,
  version: settings.version,
  createdAt: settings.createdAt,
  updatedAt: settings.updatedAt,
})

/** Cualquier fallo del driver/SQL o fila inválida → `StorePersistenceError` (503), sin propagar detalles. */
const guard = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch {
    throw new StorePersistenceError()
  }
}

/**
 * Adapter Drizzle sobre Neon HTTP (sin transacciones interactivas): cada escritura es una
 * sentencia atómica; la edición se condiciona a la versión leída.
 */
export class StoreRepositoryPostgres implements StoreRepository {
  constructor(private readonly db: Db) {}

  findSettings(storeId: string): Promise<StoreSettings | null> {
    return guard(async () => {
      const [row] = await this.db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1)
      return row ? toSettings(row) : null
    })
  }

  insertSettingsIfAbsent(settings: StoreSettings): Promise<boolean> {
    return guard(async () => {
      const inserted = await this.db
        .insert(storesTable)
        .values(toRow(settings))
        .onConflictDoNothing({ target: storesTable.id })
        .returning({ id: storesTable.id })
      return inserted.length > 0
    })
  }

  updateSettings(settings: StoreSettings, expectedVersion: number): Promise<StoreSettings | null> {
    return guard(async () => {
      const { id: _id, createdAt: _createdAt, ...changes } = toRow(settings)
      const [row] = await this.db
        .update(storesTable)
        .set(changes)
        .where(and(eq(storesTable.id, settings.id), eq(storesTable.version, expectedVersion)))
        .returning()
      return row ? toSettings(row) : null
    })
  }
}
