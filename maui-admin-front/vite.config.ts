import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

// `base` controla el prefijo público del admin:
//   - dev standalone: '/'
//   - bajo el origin unificado (Paso 4/5): '/admin/'
// El `basename` del BrowserRouter en App.tsx lee `import.meta.env.BASE_URL`.
const BASE = process.env.VITE_ADMIN_BASE ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom', 'react-router'],
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      allow: ['..'],
    },
  },
  plugins: [react()],
})
