import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // npm workspaces hoist React to the root node_modules.
    // dedupe ensures Vite resolves a single instance in dev mode.
    dedupe: ['react', 'react-dom', 'react-router-dom', 'react-router'],
  },
  server: {
    fs: {
      // Allow serving files from the monorepo root (for hoisted node_modules)
      allow: ['..'],
    },
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
})
