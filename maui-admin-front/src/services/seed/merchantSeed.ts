// Seed inicial del merchant config (Leche y Miel) — idempotente vía marker.

import type { MerchantConfig } from '@/types/merchant'

const STORAGE_KEY = 'maui-admin-merchant'
const SEED_MARKER = 'maui-admin-merchant-seeded-v1'

export const SEED_MERCHANT_ID = 'mch_lechemiel'

export const SEED_MERCHANT: MerchantConfig = {
  merchantId: SEED_MERCHANT_ID,
  name: 'Leche y Miel',
  whatsapp: '573000000000',
  address: 'Calle 5 # 4-12, Dolores, Tolima',
  updatedAt: new Date('2026-06-11T00:00:00.000Z').toISOString(),
}

export function runMerchantSeed(): void {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(SEED_MARKER) === '1') return
  const existing = window.localStorage.getItem(STORAGE_KEY)
  if (!existing) {
    const seedMap: Record<string, MerchantConfig> = { [SEED_MERCHANT_ID]: SEED_MERCHANT }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedMap))
  }
  window.localStorage.setItem(SEED_MARKER, '1')
}
