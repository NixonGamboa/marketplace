import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// El proxy /admin sólo se activa cuando corremos `dev:unified` (env flag).
// En preview (build ya injertado) y en `dev` normal se desactiva.
const UNIFIED_DEV = process.env.VITE_UNIFIED_DEV === '1'

export default defineConfig(() => ({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
    // npm workspaces hoist React to the root node_modules.
    // dedupe ensures Vite resolves a single instance in dev mode.
    dedupe: ['react', 'react-dom', 'react-router-dom', 'react-router'],
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // Allow serving files from the monorepo root (for hoisted node_modules)
      allow: ['..'],
    },
    // Origin unificado (solo dev): sirve el admin bajo /admin/ del mismo host+puerto.
    // El admin debe correr en :5174 con VITE_ADMIN_BASE=/admin/ (script `dev:unified`).
    // Bajo el mismo origin ambos apps comparten localStorage y el evento `storage`
    // dispara la alerta de nuevos pedidos cross-tab (ADR-003).
    proxy: UNIFIED_DEV ? {
      '/admin': {
        target: 'http://localhost:5174',
        changeOrigin: false,
        ws: true,
      },
    } : undefined,
  },
  // preview sirve el artefacto unificado (admin ya está en dist/admin/) — sin proxy.
  preview: {
    port: 4173,
  },
  plugins: [
    react(),
    VitePWA({
      // El worker (src/sw.ts) lleva la política de caché propia; ver src/pwa/.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // La versión nueva espera a que la persona la acepte (PWAUpdateBanner): no se recarga sola.
      registerType: 'prompt',
      // IIFE: el worker generado se puede ejecutar fuera del navegador (scripts/verify-pwa-build.mjs).
      injectManifest: {
        rollupFormat: 'iife',
        // Precache = app shell. Las imágenes comerciales se cachean al verse (src/pwa/runtimeCache.ts);
        // `admin/` es otra app injertada en dist/admin/ y no entra al worker de la PWA.
        globPatterns: ['**/*.{js,css,html,svg}', 'icons/icon-192.png', 'icons/apple-touch-icon.png'],
        globIgnores: ['admin/**/*', 'vite.svg'],
        maximumFileSizeToCacheInBytes: 512 * 1024,
      },
      // Los iconos 512 los descarga el navegador al instalar; no hace falta precachearlos.
      includeManifestIcons: false,
      // Sin worker en `npm run dev`: evita cachés viejas al desarrollar. Se prueba sobre `vite preview`.
      devOptions: { enabled: false },
      // Único manifest efectivo: se emite como /manifest.webmanifest y se enlaza desde index.html.
      manifest: {
        id: '/',
        name: 'MAUI — Tu Mercado Local',
        short_name: 'MAUI',
        description: 'Tu mercado local, digital y sin fricción',
        lang: 'es-CO',
        theme_color: '#5B3DF5',
        background_color: '#F8F9FC',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['shopping', 'food'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
}))
