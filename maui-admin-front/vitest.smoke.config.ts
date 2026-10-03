import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Smokes de lectura y flujo real habilitado explícitamente contra un Preview real (`npm run smoke:preview`). Fuera de `npm test`.
if (!process.env.SMOKE_BASE_URL) {
  throw new Error('Define SMOKE_BASE_URL con la URL del Preview (https://…vercel.app, sin /api)')
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/smoke/**/*.smoke.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    sequence: { concurrent: false },
    bail: 1,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
})
