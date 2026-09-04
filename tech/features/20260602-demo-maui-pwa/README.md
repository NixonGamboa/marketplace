# Feature: demo-maui-pwa

> **Status**: ✅ Completed — 2026-06-11
> **Mode**: Brownfield · Prototype · Standard execution
> **Apps**: `MAUI-PWA-customers` (PWA cliente) + `maui-admin-front` (panel admin demo)

---

## Resumen

Demo end-to-end de la plataforma MAUI con el aliado **Leche y Miel** (supermercado en Dolores, Tolima). Completa todos los flujos del usuario con `mockOrderService` que respeta el contrato de la API real, reemplaza el catálogo ficticio con datos verificados del aliado, e incluye un panel admin standalone que opera contra `localStorage` para simular la transición de estados de un pedido y disparar links de WhatsApp prellenados.

El swap mock → backend real es un cambio de import en `services/index.ts` controlado por `VITE_DEMO_MODE`.

---

## Qué se construyó

### MAUI-PWA-customers

- **Home rediseñada**: `HeroCarousel`, sección "Beneficios para ti", "Categorías principales" con PNGs circulares, `MauiPlusCard`, "Ofertas del día".
- **Sidebar desktop**: `BusinessCategoryGroup` colapsable con `SidebarSection` y chevron animado.
- **Header responsive** de una sola fila con buscador inline.
- **BottomNavBar PWA-nativa** (móvil/tablet `< lg`): Inicio · Ofertas · Carrito (FAB) · Mis pedidos · Favoritos.
- **Taxonomía**: `BusinessCategoryGroup` → `BusinessCategory` (sidebar / verticales de plataforma) separado de `Category` (catálogo del aliado).
- **Rutas nuevas**: `/catalog`, `/catalog/:categoryId`, `/search`, `/checkout`, `/pedidos`, `/pedidos/:orderId`, `/ofertas`, `/favoritos`, `/perfil`.
- **CheckoutPage** con 4 steps: resumen → modalidad → sustitución → confirmación.
- **OrderDetailPage** con `OrderTimeline` de 5 estados y polling.
- **ProductDetailSheet** — bottom sheet 90dvh con imagen 4:3, descripción, info nutricional y selector de cantidad.
- **VariableWeightSheet** — soporte de peso variable en kg.
- **mockOrderService** — persistencia en `localStorage` (`maui-orders`) con delays 800–1200 ms.
- **mockData.ts** — ~15 productos reales de Leche y Miel.
- **authStore** — `DEMO_USER` pre-autenticado cuando `VITE_DEMO_MODE=true`; login real con WhatsApp en otro caso.
- **Dark mode** infrastructure (`themeStore`, `ThemeToggle`, `useThemeSync`).
- **Shipping calculation module** (`shipping.ts`).
- **Perfil de usuario** + login WhatsApp funcional.

### maui-admin-front

- Lista de pedidos leídos desde `localStorage`.
- Detalle de pedido con items, total estimado y estado actual.
- Transición de estados: Recibido → Confirmado → Preparando → Listo → Entregado.
- WhatsApp link prellenado por estado.
- `StatusBadge`, `WhatsAppLink`, `DemoSimulator` (auto-avance 20s).

---

## Stack

- **PWA cliente**: React 19.1 · TypeScript 5.8 · Vite 7.1 · Zustand 5 · TanStack Query 5.9 · TailwindCSS 3.4 · vite-plugin-pwa 1.0 (Workbox) · React Router 7.9
- **Admin demo**: React 19 · TypeScript · Vite · TailwindCSS (sin Zustand, sin Query — `localStorage` directo)

---

## Validación final

| Check | Resultado |
|-------|-----------|
| Tareas completadas | 36/36 ✅ |
| Typecheck PWA | ✅ Sin errores |
| Typecheck admin | ✅ Sin errores |
| Build PWA | ✅ `dist/` 26.6 MB precached · gzip index 91 kB |
| Build admin | ✅ `dist/` 236 kB · gzip 76 kB |
| Tests automáticos | ⏭️ Omitidos (prototype mode) |
| Consistencia specs ↔ código | ✅ APPROVED (tech-layer-analyzer) |

---

## Especificaciones

- [`functional-spec.md`](./functional-spec.md) — qué se construyó
- [`technical-spec.md`](./technical-spec.md) — cómo se construyó
- [`tasks.json`](./tasks.json) — desglose de 36 tareas ejecutadas
- [`meta.md`](./meta.md) — metadatos completos del workflow

## Referencias

- RFC aprobado: `MAUI-PWA-customers/docs/demo-maui-pwa-rfc.md`
- Aliado: **Leche y Miel** — supermercado local en Dolores, Tolima
