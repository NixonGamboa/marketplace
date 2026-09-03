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
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
      manifest: {
        name: 'MAUI',
        short_name: 'MAUI',
        theme_color: '#5B3DF5',
        background_color: '#F8F9FC',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB — hero images are large
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: { cacheName: 'images-cache' },
          },
          {
            urlPattern: /\/api\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'api-cache' },
          },
        ],
      },
    }),
  ],
}))
