// Orchestrator de todos los seeds del admin. Cada `runXxxSeed()` es idempotente
// (marker propio `maui-admin-<dominio>-seeded-v1`), así que llamar a esto en
// cada arranque es seguro y barato.
//
// IMPORTANTE: NO toca `maui-orders` ni `maui-orders-seeded-v1`. Esos los
// siembra el PWA (ADR-001 + §9). El admin sólo observa esa key.

import { runCatalogSeed } from './catalogSeed'
import { runUsersSeed } from './usersSeed'
import { runMerchantSeed } from './merchantSeed'
import { runStoreStatusSeed } from './storeStatusSeed'

export function runAllSeeds(): void {
  runCatalogSeed()
  runUsersSeed()
  runMerchantSeed()
  runStoreStatusSeed()
}
