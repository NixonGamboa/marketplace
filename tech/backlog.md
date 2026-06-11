# Technical Backlog

> Items capturados durante el desarrollo. Usa `/tech.backlog` para gestionar.

**Last Updated**: 2026-06-10
**Total Items**: 2 (2 TODO, 0 DEBT, 0 IDEA)

---

## 📋 TODOs

### TODO-001: Ajustar estilos dark mode en todos los componentes
- **Priority**: Medium
- **Status**: pending
- **Created**: 2026-06-10
- **Origin**: conversación directa (dark mode toggle)
- **Context**: La infraestructura de dark mode ya está implementada (CSS variables en `:root`/`.dark`, Zustand `themeStore`, hook `useThemeSync`, componente `ThemeToggle`). Falta revisar componente por componente que los colores respondan correctamente al modo oscuro. El botón `ThemeToggle` está oculto en el Header (`hidden`) hasta completar este trabajo.
- **Affected Files**: `MAUI-PWA-customers/src/shared/components/`, `MAUI-PWA-customers/src/features/`
- **Complexity**: L

### TODO-002: PWA production readiness — completar fixes para instalación
- **Priority**: Medium
- **Status**: pending
- **Created**: 2026-06-10
- **Origin**: conversación directa (análisis PWA customers app)
- **Context**: La app tiene ~80% del soporte PWA listo. Ya existe: `vite-plugin-pwa` configurado, service worker con Workbox (precaching + CacheFirst + StaleWhileRevalidate), iconos en todos los tamaños (192x192, 512x512, maskable), auto-registro del SW en `main.tsx`. Faltan 4 fixes para producción.
- **Pre-conditions (VALIDAR antes de tomar)**: Verificar que estos archivos/items siguen en el mismo estado: (1) `MAUI-PWA-customers/index.html` — confirmar que sigue sin `<link rel="manifest">` y sin tags Apple; (2) `MAUI-PWA-customers/vite.config.ts` — confirmar que el manifest sigue definido ahí Y también en `public/manifest.json` (duplicado); (3) `MAUI-PWA-customers/src/service-worker.js` — confirmar que sigue sin página offline fallback configurada.
- **Affected Files**: `MAUI-PWA-customers/index.html`, `MAUI-PWA-customers/vite.config.ts`, `MAUI-PWA-customers/public/manifest.json`, `MAUI-PWA-customers/src/service-worker.js`
- **Complexity**: S
- **Checklist**:
  - [ ] Agregar `<link rel="manifest" href="/manifest.json">` en `index.html`
  - [ ] Agregar tags Apple (`apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`) en `index.html`
  - [ ] Crear página offline fallback y configurarla en el service worker
  - [ ] Consolidar manifest: eliminar definición duplicada en `vite.config.ts`, dejar solo `public/manifest.json`

---

## 🔧 Technical Debt

_(sin items)_

---

## 💡 Ideas

_(sin items)_

---

## ✅ Resolved Items

_(sin items)_
