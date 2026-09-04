// Mock MerchantRepository — almacena merchants por id en localStorage.

import type { MerchantConfig } from '@/types/merchant'
import { mockAuditRepository } from './mockAuditRepository'
import { randomDelay } from './delay'
import { SEED_MERCHANT, SEED_MERCHANT_ID } from './seed/merchantSeed'

const STORAGE_KEY = 'maui-admin-merchant'

export interface MerchantRepository {
  get(merchantId: string): Promise<MerchantConfig>
  update(cfg: MerchantConfig, by: string): Promise<MerchantConfig>
}

function readMap(): Record<string, MerchantConfig> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as Record<string, MerchantConfig>
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, MerchantConfig>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export const mockMerchantRepository: MerchantRepository = {
  async get(merchantId) {
    await randomDelay()
    const map = readMap()
    const existing = map[merchantId]
    if (existing) return existing
    // Si aún no se sembró, devolvemos el seed para el merchant conocido.
    if (merchantId === SEED_MERCHANT_ID) return SEED_MERCHANT
    throw new Error(`Aliado ${merchantId} no encontrado`)
  },

  async update(cfg, by) {
    await randomDelay()
    const map = readMap()
    const previous = map[cfg.merchantId]
    const updated: MerchantConfig = { ...cfg, updatedAt: new Date().toISOString() }
    map[cfg.merchantId] = updated
    writeMap(map)
    await mockAuditRepository.log({
      user: by,
      action: 'merchant.config_changed',
      targetId: cfg.merchantId,
      meta: { previous, next: updated },
    })
    return updated
  },
}

export const realMerchantRepository: MerchantRepository = {
  get() {
    throw new Error('realMerchantRepository not implemented (swap from VITE_DEMO_MODE)')
  },
  update() {
    throw new Error('realMerchantRepository not implemented (swap from VITE_DEMO_MODE)')
  },
}
