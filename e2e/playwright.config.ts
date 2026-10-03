import { defineConfig } from '@playwright/test'
import { ARTIFACTS_DIR } from './support/runtime.js'

/**
 * Runner E2E de navegador (T-22). Usa el Chrome INSTALADO (`channel: 'chrome'`; nunca descarga
 * navegadores). Trazas, video y screenshots automáticos están desactivados a propósito: contienen
 * red y formularios con credenciales. Las capturas son solo las saneadas de `sanitizedShot`.
 *
 * Proyectos: `selftest` (sin navegador ni red; valida guardas y saneado) y `real` (contra el
 * Preview de test en modo REAL; se lanza con `npm run e2e:check` / `npm run e2e:smoke`).
 */
const chromePath = process.env.E2E_CHROME_PATH

export default defineConfig({
  testDir: '.',
  outputDir: ARTIFACTS_DIR,
  reporter: [['./support/sanitizedReporter.ts']],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // El smoke espera sondeos de 30 s de ambas apps; el límite cubre el flujo completo.
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  use: {
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: 'selftest', testMatch: 'selftest/**/*.spec.ts' },
    {
      name: 'real',
      testMatch: 'tests/**/*.spec.ts',
      use: chromePath ? { launchOptions: { executablePath: chromePath } } : { channel: 'chrome' },
    },
  ],
})
