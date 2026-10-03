/**
 * Fixtures técnicos persistentes sobre tienda y catálogo reales del Preview. Cada cambio se registra
 * ANTES de mutar (valor previo, valor aplicado y versión real del producto de personal) y se restaura
 * siempre, incluso si el escenario falla. Ninguna respuesta de negocio se simula.
 */
import { expect } from '@playwright/test'
import type { StaffProductDto, StoreDto, UpdateProductRequest, UpdateStoreSettingsRequest } from '../../shared/contracts/index.js'
import { saveRuntime, type FixtureRecord, type RuntimeRecord } from './runtime.js'

/** Operaciones owner mínimas; el runner las implementa con la API real y los selftests con un doble en memoria. */
export interface FixtureApi {
  readStaffStore(): Promise<StoreDto>
  /** Producto de personal con su `version` real: el DTO público no la incluye. */
  readStaffProduct(id: string): Promise<StaffProductDto>
  patchStore(patch: UpdateStoreSettingsRequest): Promise<StoreDto>
  patchProduct(id: string, patch: UpdateProductRequest): Promise<StaffProductDto>
}

type Persist = (runtime: RuntimeRecord, phase?: string) => void

const pick = (source: object, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(keys.map((key) => [key, Reflect.get(source, key) ?? null]))

const sameValues = (current: object, expected: Record<string, unknown>): boolean =>
  Object.entries(expected).every(([key, value]) => JSON.stringify(Reflect.get(current, key) ?? null) === JSON.stringify(value))

export class TechnicalFixtures {
  constructor(private readonly api: FixtureApi, private readonly runtime: RuntimeRecord, private readonly persist: Persist = saveRuntime) {}

  /** Cambio de tienda por API owner (p. ej. contacto técnico o cierre). */
  async store(patch: UpdateStoreSettingsRequest): Promise<void> {
    const current = await this.api.readStaffStore()
    const record = this.register({ kind: 'store', id: current.storeId, original: pick(current, Object.keys(patch)), applied: { ...patch } })
    await this.api.patchStore(patch)
    this.persist(this.runtime, `fixture-applied:${record.kind}`)
  }

  /** Cambio de producto por API owner, leyendo antes su versión real de personal. */
  async product(id: string, patch: UpdateProductRequest): Promise<void> {
    const current = await this.api.readStaffProduct(id)
    const record = this.register({
      kind: 'product', id, original: pick(current, Object.keys(patch)), applied: { ...patch }, versionBefore: current.version,
    })
    await this.api.patchProduct(id, patch)
    this.persist(this.runtime, `fixture-applied:${record.kind}`)
  }

  /** Registra el valor previo de un producto que se editará por la UI; la restauración es incondicional. */
  async watchProduct(id: string, keys: (keyof UpdateProductRequest & string)[]): Promise<void> {
    const current = await this.api.readStaffProduct(id)
    this.register({ kind: 'product', id, original: pick(current, keys), versionBefore: current.version })
    this.persist(this.runtime, 'fixture-watched:product')
  }

  /**
   * Devuelve todo lo registrado en orden inverso. Un cambio aplicado por API solo se revierte si el
   * valor sigue siendo el nuestro: otro actor pudo editarlo y no se pisa. Falla (tras intentar todos)
   * si algún valor no quedó como estaba.
   */
  async restore(): Promise<void> {
    const failures: string[] = []
    for (const fixture of [...(this.runtime.fixtures ?? [])].reverse()) {
      if (fixture.restored) continue
      try {
        await this.restoreOne(fixture)
      } catch (error) {
        failures.push(`${fixture.kind} ${fixture.id}: ${error instanceof Error ? error.message : 'fallo desconocido'}`)
      }
    }
    if (failures.length > 0) throw new Error(`Fixtures sin restaurar: ${failures.join('; ')}`)
  }

  private async restoreOne(fixture: FixtureRecord): Promise<void> {
    const isStore = fixture.kind === 'store'
    const current = isStore ? await this.api.readStaffStore() : await this.api.readStaffProduct(fixture.id)
    if (sameValues(current, fixture.original)) {
      fixture.restored = true
    } else {
      if (fixture.applied && !sameValues(current, fixture.applied)) {
        this.runtime.findings.push(`Fixture ${fixture.kind} ${fixture.id}: otro actor cambió ${Object.keys(fixture.applied).join(', ')}; no se pisa`)
        fixture.restored = true
        this.persist(this.runtime, 'fixture-skipped')
        return
      }
      const restored = isStore
        ? await this.api.patchStore(fixture.original as UpdateStoreSettingsRequest)
        : await this.api.patchProduct(fixture.id, fixture.original as UpdateProductRequest)
      for (const [key, value] of Object.entries(fixture.original)) {
        expect(Reflect.get(restored, key) ?? null, `restauración del campo ${key}`).toEqual(value)
      }
      fixture.restored = true
    }
    this.persist(this.runtime, 'fixtures-restored')
  }

  private register(entry: Omit<FixtureRecord, 'restored'>): FixtureRecord {
    const record: FixtureRecord = { ...entry, restored: false }
    this.runtime.fixtures ??= []
    this.runtime.fixtures.push(record)
    this.persist(this.runtime, `fixture-prepared:${record.kind}`)
    return record
  }
}
