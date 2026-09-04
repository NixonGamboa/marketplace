# Technical Backlog

> Items capturados durante el desarrollo. Usa `/tech.backlog` para gestionar.

**Last Updated**: 2026-06-10
**Total Items**: 3 (2 TODO, 1 DEBT, 0 IDEA)

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

### DEBT-001: Evidencia fotográfica de pesos reales en OrderDetail (admin)
- **Priority**: Medium
- **Status**: pending
- **Created**: 2026-06-11
- **Origin**: análisis PO `docs/negocio/producto-review-admin-fase0.md` §1 ("subir fotos de calidad")
- **Context**: El objetivo del admin según el contexto MAUI incluye "subir fotos de calidad" como evidencia del peso real capturado en items `is_variable_weight` (queso campesino, frijol, chorizo). Sin almacenamiento real (S3/CDN) no tiene ROI en la demo con mocks — la foto se perdería al limpiar localStorage o explotaría el cap de 5MB. La feature `evolucion-admin-panel-demo` (2026-06-11) deja la captura de peso vía `WeightInput` pero sin foto. Implementar cuando haya storage real en Sprint 1.
- **Affected Files**: `maui-admin-front/src/features/orders/OrderDetailPage.tsx`, `maui-admin-front/src/types/orderService.ts` (campo `evidencePhotoUrl?: string` en CartItem o nivel order), backend de uploads (Sprint 1)
- **Complexity**: M
- **Blocker**: requiere capa de Object Storage real; no se implementa con mocks
- **Acceptance criteria (al tomarla)**:
  - Operator puede tomar foto con la cámara de la tablet desde OrderDetail (input file con `capture="environment"`)
  - Foto persistida vía upload al storage real
  - Foto visible en histórico y picking list
  - Evidencia incluida en audit event `order.weights_set`

---

## 💡 Ideas

_(sin items)_

---

## ✅ Resolved Items

_(sin items)_
