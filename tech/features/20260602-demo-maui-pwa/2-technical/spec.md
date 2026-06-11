# Technical Specification — demo-maui-pwa
<!-- Tech SDD Kit | Language: es | Generated: 2026-06-02 -->

---

## Executive Summary

Esta feature completa el frontend de la PWA MAUI Customers (brownfield, ~55% construido) y scaffoldea el panel admin demo desde cero en `maui-admin-front/`. Ambas apps comparten `localStorage` como mecanismo de comunicación. No hay backend — toda la capa de datos usa `mockOrderService` con delays que simulan 3G.

**Apps afectadas**:
- `MAUI-PWA-customers/` — PWA React 19 existente (estructura aplanada: `src/` en la raíz tras commit `ebcf57b`)
- `maui-admin-front/` — Panel admin nuevo (Vite + React 19 + TypeScript + TailwindCSS)

> **Nota de iteración (2026-06-08)**: La Home, el Layout (Header de una fila, BottomNav PWA, RootLayout) y el modelo de datos (`BusinessCategory`/`BusinessCategoryGroup` vs `Category`) fueron rediseñados después de la aprobación original. Las demás vistas (Catalog, Cart, Checkout, Orders, Auth) aún están pendientes de iteración.

**Principio de swapeo**: Al llegar el Sprint 1 de backend, el único cambio es reemplazar `mockOrderService` por `realOrderService` en `services/index.ts`. Ningún componente requiere modificación.

---

## Architecture Overview

### Vista general del sistema (demo)

```
         MAUI-PWA-customers (PWA Cliente)
         ┌──────────────────────────────────────────┐
         │  React 19 + Vite + React Router DOM v7   │
         │                                          │
         │  features/catalog/{pages, components}    │
         │  features/checkout  features/cart        │
         │  features/orders    features/auth        │
         │                                          │
         │  shared/components/layout                │
         │    Header · Footer · RootLayout          │
         │    BottomNavBar (PWA móvil < lg)         │
         │                                          │
         │  stores: cartStore · checkoutStore       │
         │          authStore · uiStore             │
         │                                          │
         │  hooks/useCatalog.ts                     │
         │    useProducts · useFeaturedProducts     │
         │    useCategories                         │
         │    useBusinessCategoryGroups             │
         │                                          │
         │  services/index.ts (VITE_DEMO_MODE)      │
         │    └── mockOrderService ──────────────▶  │
         └─────────────────────┬────────────────────┘
                               │ localStorage
                               │ (maui-cart, maui-orders)
         maui-admin-front      │
         ┌─────────────────────▼────────────────────┐
         │  React 19 + Vite (nuevo scaffold)        │
         │                                          │
         │  OrdersList · OrderDetail                │
         │  StatusControls · WhatsAppLink           │
         │  DemoSimulator (auto-avanza 20s)         │
         └──────────────────────────────────────────┘
```

### Arquitectura de datos (demo)

```
  mockData.ts ──▶ React Query (catalog)
                        │
                        ▼
                   ProductCard / ProductDetailSheet
                        │ addItem()
                        ▼
                   cartStore (Zustand persist)
                        │ localStorage: maui-cart
                        ▼
                   CheckoutPage
                        │ submit(OrderPayload)
                        ▼
               mockOrderService (delay 1200ms)
                        │ localStorage: maui-orders
                        ▼
                   OrderConfirmation
                        │ router.replace()
                        ▼
                   OrderDetailPage
                        │ getById() delay 800ms
                        ▼
                   OrderTimeline (5 estados)

         maui-admin-front
                   └── lee maui-orders (localStorage)
                   └── escribe status updates
```

---

## Design Decisions

### DD-1: Comunicación entre apps via localStorage

**Seleccionado**: `localStorage` compartido (mismo origen si se sirven del mismo dominio)

**Options Considered**:
- Option A (seleccionada): `localStorage` — zero infrastructure, suficiente para demo con un solo dispositivo
- Option B: `BroadcastChannel API` — sincronización en tiempo real entre pestañas, más complejo
- Option C: Backend real — fuera de scope del demo

**Trade-offs Accepted**: La comunicación via localStorage no funciona entre dispositivos distintos ni en múltiples empleados simultáneos. Es un atajo consciente exclusivo del demo — documentado en el RFC §7.

**Rationale**: Para el objetivo del demo (un facilitador, un dispositivo), localStorage es la solución más simple. `mockOrderService` escribe en `localStorage['maui-orders']`; el admin lee y escribe en la misma key; el polling del cliente usa `mockOrderService.getById()`.

---

### DD-2: Panel admin como app independiente (no ruta de la PWA)

**Seleccionado**: App Vite separada en `maui-admin-front/`

**Options Considered**:
- Option A (seleccionada): App separada — separación de responsabilidades, refleja la arquitectura objetivo de producción
- Option B: Ruta `/admin` en la misma PWA — más rápido de scaffoldear pero mezcla contextos y bundlea código del empleado en el bundle del cliente

**Trade-offs Accepted**: Requiere scaffoldear un proyecto Vite nuevo. Costo: ~1 hora de setup. Beneficio: el admin tiene su propio bundle y puede evolucionar hacia producción sin refactorizar la PWA cliente.

**Rationale**: La arquitectura objetivo de producción separa la app del cliente de la app del empleado. El demo debe reflejar esa separación desde el inicio para no acumular deuda técnica.

---

### DD-3: checkoutStore efímero (sin persistencia)

**Seleccionado**: Zustand store sin middleware `persist`

**Options Considered**:
- Option A (seleccionada): Efímero — el store se destruye al confirmar o salir del flujo
- Option B: Persistido — permitiría resumir checkouts interrumpidos, añade complejidad innecesaria para el demo

**Trade-offs Accepted**: Un usuario que cierra el navegador en medio del checkout pierde su selección de modalidad/sustitución. El carrito sí persiste (cartStore usa `persist`), así que puede reiniciar el checkout.

**Rationale**: El estado del checkout es efímero por naturaleza — no debe sobrevivir recargas para evitar inconsistencias. La persistencia del carrito (el dato valioso) ya está cubierta por `cartStore`.

---

### DD-4: Auth pre-autenticada con DEMO_USER

**Seleccionado**: `DEMO_USER` hardcoded en `authStore` cuando `VITE_DEMO_MODE=true`

**Options Considered**:
- Option A (seleccionada): Flag de entorno — `authStore` expone `DEMO_USER` directo, sin flujo de login
- Option B: Magic Link mock — simular el flujo completo de OTP/WhatsApp pero con delay falso

**Trade-offs Accepted**: El demo no valida la fricción del onboarding real (ingreso de número + espera del link). Riesgo conocido documentado en el RFC §7, materia de Fase 2.

**Rationale**: El objetivo del demo es validar el flujo post-login (catálogo → checkout → confirmación). La fricción del login es una variable separada que se valida después con usuarios reales, no en el demo de funcionalidad.

---

### DD-5: Taxonomía `BusinessCategory` vs `Category`

**Seleccionado**: Dos tipos distintos en el modelo de datos — `BusinessCategory` (vertical de plataforma, sidebar) y `Category` (pasillo de producto, catálogo).

**Options Considered**:
- Option A (seleccionada): Tipos separados con propósito distinto — refleja la visión MAUI multi-vertical/multi-aliado desde el inicio
- Option B: Tipo único `Category` con un flag `kind: 'business' | 'product'` — más simple a corto plazo pero mezcla preocupaciones de plataforma y aliado en un solo modelo
- Option C: Solo `Category` y derivar el sidebar de un agrupamiento ad-hoc — colapsa la jerarquía en runtime y obstaculiza la futura entrada de otras verticales (Restaurantes, Servicios, Comunidad)

**Trade-offs Accepted**: Duplica conceptualmente la palabra "categoría"; requiere disciplina del equipo para no mezclarlos en código ni en copy. Documentado en la memoria del proyecto y en CLAUDE.md raíz.

**Rationale**: MAUI no es app de supermercado — es plataforma que conecta usuarios con soluciones locales. El sidebar muestra verticales (Mercado, Restaurantes, Servicios, Comunidad); el catálogo muestra pasillos de un aliado específico (Leche y Miel). El modelo refleja esa separación desde el demo para evitar refactor cuando entren más verticales.

---

### DD-6: Navegación dual desktop / PWA-móvil

**Seleccionado**: Sidebar desktop (`≥ lg`) + `BottomNavBar` PWA (`< lg`) — Header de una sola fila compartido entre ambos breakpoints.

**Options Considered**:
- Option A (seleccionada): Dual nav por breakpoint — patrón PWA-nativo Android/iOS
- Option B: Hamburger drawer único para ambos — ahorra código pero rompe la affordance móvil esperada de e-commerce
- Option C: Header con tabs horizontales — funcional pero ocupa altura valiosa en móvil y no es PWA-nativo

**Trade-offs Accepted**: Dos componentes de navegación a mantener. El sidebar y la BottomNav muestran cosas distintas (verticales de plataforma vs accesos rápidos) — esto es intencional, no inconsistencia.

**Rationale**: La PWA debe sentirse nativa al instalarse en Android. `BottomNavBar` con FAB de carrito + `safe-area-inset-bottom` replica patrones nativos de e-commerce móvil; el sidebar desktop aprovecha el ancho disponible para mostrar la oferta completa de la plataforma.

---

## Component Architecture

### MAUI-PWA-customers — Layout & Navegación (iteración 2026-06-08)

#### `shared/components/layout/RootLayout.tsx` — NUEVO
- Wrapper de todas las rutas con layout completo (excepto `*`)
- Renderiza: `Header` · `<main><Outlet/></main>` · `Footer` (oculto en `lg:hidden`) · `PWAUpdateBanner` · `BottomNavBar` condicional
- Padding inferior dinámico: `paddingBottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))`
- Hook `useBottomNavVisible()` controla la visibilidad de la BottomNav por ruta

#### `shared/components/layout/Header.tsx` — NUEVO
- Una sola fila en todos los breakpoints (`h-14 md:h-16`)
- **Móvil**: `imagotipo.png` · buscador `flex-1` · carrito redondo 40×40 · avatar
- **Desktop (`≥ md`)**: `isotipo.png` (en caja) + `logotipo.png` + subtítulo "En alianza con Leche y Miel" · buscador · nav (Ofertas, Mis pedidos, Favoritos) · carrito pill con total COP · avatar

#### `shared/components/layout/BottomNavBar.tsx` — NUEVO (PWA móvil/tablet)
- Visible `lg:hidden`. 5 slots fijos:
  1. Inicio → `/`
  2. Ofertas → `/ofertas` *(ruta pendiente)*
  3. Carrito → `/cart` (FAB elevado con badge `cartCount`; plano cuando vacío)
  4. Mis pedidos → `/pedidos`
  5. Favoritos → `/favoritos` *(ruta pendiente)*
- Respeta `env(safe-area-inset-bottom)` para PWA instalada

---

### MAUI-PWA-customers — Home (iteración 2026-06-08)

#### `features/catalog/pages/Home.tsx` — REDISEÑADA
Secciones verticales en orden:

1. **`HeroCarousel`** — 2 slides autoplay 5 s, pause on hover/focus
2. **"Beneficios para ti"** — grid de 4 tarjetas (Truck · ShieldCheck · Award · MessageCircle) definido inline en `BENEFITS`. Sub-texto de cada tarjeta visible solo desde `md` (`hidden md:block`)
3. **"Categorías principales"** — scroll horizontal en móvil / `md:grid-cols-9` en desktop. PNG circular 96×96 (`w-24 h-24`) desde `useCategories()` con `shadow-[0_4px_14px_rgba(99,102,241,0.25)]`. En móvil las cards de categoría son `shrink-0 w-[80px]` sin bg/borde/sombra; en desktop (`md:`) se añaden `bg-white rounded-xl border shadow-card hover:shadow-card-hover`
4. **"Ofertas del día 🔥"** — `grid-cols-2 md:grid-cols-3 xl:grid-cols-5`. Slot 1 fijo: `MauiPlusCard`. Slots 2–5: productos de `useFeaturedProducts()`
5. **Trust bar** (solo desktop) — 3 frases en `TRUST`

**Sidebar desktop** (`<aside className="hidden lg:flex">`): mapea `useBusinessCategoryGroups()` → `SidebarSection` colapsable + tarjeta promo "Envío gratis $30.000" con imagen `promoEnvioGratis`.

#### `features/catalog/components/HeroCarousel.tsx` — NUEVO
- 2 slides definidos en `assets/hero/index.ts`:
  1. "Maui y Leche y Miel, más cerca de ti" — eyebrow "Juntos por Dolores, Tolima", CTA `/catalog`
  2. "Productos frescos todos los días" — CTA `/catalog/lacteos`
- Gradiente horizontal `bg-gradient-to-r` con más opacidad blanca en móvil para legibilidad
- Badge circular 72×72 oculto en móvil (`hidden md:flex`)
- Dots/pills inferiores; flechas prev/next solo desktop

#### `SidebarSection` (inline en `Home.tsx`) — NUEVO
- Renderiza un `BusinessCategoryGroup` con header colapsable
- Chevron animado: `-rotate-180` cuando `expanded === true` (default true)
- Items con `comingSoon: true` → badge "Próximamente" + `aria-disabled` (no navegan)
- Estilo activo: `bg-brand-primary-light text-brand-primary font-semibold`

#### `MauiPlusCard` (inline en `Home.tsx`) — NUEVO
- Tarjeta promo con gradiente brand-primary/secondary
- Imagen `bannerAhorraMauiPlus` con overlay
- Ocupa el primer slot del grid "Ofertas del día"

---

## Component Architecture (resto — sin cambios respecto a la aprobación original)

### MAUI-PWA-customers — Nuevos componentes

#### `features/catalog/pages/CatalogPage.tsx` — NUEVO
- **Ruta**: `/catalog/:categoryId`
- **Props**: `categoryId` (desde `useParams`)
- **Data**: `useProducts()` (sin argumentos) + filtrado por `categoryId` dentro del componente — React Query, `staleTime: 5min`
- **UI**: Grid de `ProductCard`, skeleton loaders mientras carga, estado vacío si no hay productos
- **Behavior**: Al tocar la imagen o nombre del producto → abre `ProductDetailSheet`

#### `features/catalog/components/ProductDetailSheet.tsx` — NUEVO (reemplaza `ProductDetailModal.tsx`, eliminado)
- **Props**: `open`, `onClose`, `name`, `image`, `price`, `originalPrice?`, `unit?`, `currency?`, `description?`, `nutritionalInfo?`, `availability?`, `inStock?`, `is_variable_weight?`, `badge?`, `cartQuantity`, `onAdd(qty)`, `onOpenWeightSheet?`
- **UI**: `createPortal` al body, overlay + panel deslizable a 90dvh. Imagen en relación 4:3 (`aspect-[4/3]`). Descripción, tabla de info nutricional (si existe), chip de disponibilidad (`availabilityChip()`). Footer sticky con `QuantityStepper` y CTA
- **Stepper**: `localQty` inicializado con `Math.max(1, cartQuantity)`. Botón `−` → `Trash2` rojo cuando `localQty === 1`. CTA → "Eliminar del carrito" cuando `localQty === 0`. Precio dinámico en CTA: `localQty × price`
- **availability chip**: "Disponible" → `bg-emerald-50 text-emerald-700`; "Pocas unidades" → `bg-amber-50 text-amber-700`; otros → `bg-gray-100 text-gray-500`
- **BottomNavBar**: lee `uiStore.bottomSheetOpen`; se desliza fuera de vista (`transition-transform translate-y-full`) mientras cualquier sheet está abierto
- **Header**: `md:sticky` — no sticky en móvil para no competir con el sheet a 90dvh

#### `features/catalog/components/ProductCard.tsx` — REFACTORED (iteración 2026-06-10)
- **Comportamiento CTA** (fila inferior precio + acción):
  - `inStock === true` + `is_variable_weight === false` + `quantity === 0` → FAB `+` circular (`w-9 h-9 rounded-full bg-brand-primary`)
  - `inStock === true` + `is_variable_weight === false` + `quantity > 0` → `<QuantityStepper>` inline
  - `inStock === true` + `is_variable_weight === true` + `kilosInCart === 0` → FAB `+` abre `<VariableWeightSheet>`
  - `inStock === true` + `is_variable_weight === true` + `kilosInCart > 0` → pill `"{X} kg [+]"` (abre sheet con `initialKilos` precargado)
  - `inStock === false` → texto "Sin stock" (compact inline, no botón)
- **Tap imagen/nombre**: abre `<ProductDetailSheet>` para ver detalle
- **Hook**: usa `useProductQuantity(id)` — lee `quantity` y `kilos` desde `cartStore`
- **Badge color**: `badge === "Local"` → `bg-emerald-600`; otros → `bg-brand-primary`
- **Layout**: precio y CTA en fila `flex items-end justify-between`; el CTA no es ancho completo

#### `features/catalog/components/QuantityStepper.tsx` — NUEVO
- **Props**: `quantity`, `onIncrement`, `onDecrement`, `disabled?`
- **UI**: Pill `bg-brand-primary rounded-full h-9` con botones `−` / contador / `+` en blanco
- **Long-press**: hold 1 s → repite cada 300 ms (`setTimeout` + `setInterval` en `onPointerDown/Up/Leave/Cancel`)
- **Accesibilidad**: `role="group"` con `aria-label="Cantidad: {quantity}"`; `touchAction: manipulation` para evitar zoom en iOS

#### `features/catalog/components/VariableWeightSheet.tsx` — ACTUALIZADO
- **Props**: `open`, `onClose`, `productName`, `pricePerUnit`, `currency?`, `initialKilos?`, `onConfirm(kilos: number)`
- **UI**: `createPortal` al body. Selector **0.25–5 kg** (paso 0.25). Precio estimado en COP en tiempo real (`kilos × pricePerUnit`)
- **`initialKilos`**: precarga el selector cuando ya hay kilos en el carrito (reabrir para editar)
- **`useEffect`** solo dispara en `[open]` para evitar reset al reeditar
- **Nota**: `safe-area-inset-bottom` en `paddingBottom`; bloquea scroll del body mientras abierto
- **TASK-031 completado**: `onConfirm(kilos)` persiste kilogramos en `CartItem.kilos`; `cartStore` acumula correctamente

#### `shared/hooks/useProductQuantity.ts` — ACTUALIZADO
- **Firma**: `useProductQuantity(productId: string | undefined) → { quantity, kilos, increment, decrement }`
- **`quantity`**: `cartStore.items.find(i => i.productId === id)?.quantity ?? 0`
- **`kilos`**: `cartStore.items.find(i => i.productId === id)?.kilos ?? 0`
- **increment**: `cartStore.updateQuantity(id, quantity + 1)`
- **decrement**: `quantity <= 1` → `cartStore.removeItem(id)`; else `cartStore.updateQuantity(id, quantity - 1)`

#### `features/checkout/CheckoutPage.tsx` — NUEVO
- **Ruta**: `/checkout`
- **Steps (un solo scroll/página)**:
  1. Resumen del carrito (items, totales, link "Seguir comprando")
  2. `DeliverySelector` (pickup / domicilio)
  3. `SubstitutionSelector` (radio buttons)
  4. CTA "Pedir mi Mercado" (bloqueado hasta que los 3 steps previos estén completos)
- **On submit**: `checkoutStore.setSubmitting(true)` → `orderService.submit(payload)` → `cartStore.clearCart()` → `router.replace('/pedidos/:orderId')`
- **Guard**: Botón deshabilitado mientras `isSubmitting || !deliveryMode || !substitutionPref`
- **Legal**: Aviso Ley 1581 visible justo encima del CTA

#### `features/checkout/DeliverySelector.tsx` — NUEVO
- **Props**: `value: DeliveryMode | null`, `onChange: (mode: DeliveryMode, data: DeliveryData) => void`
- **UI**: 2 opciones — Pickup (3 timeslots: mañana/tarde/ya mismo) | Domicilio (input dirección + botón geolocalización)
- **Geolocation**: `navigator.geolocation.getCurrentPosition()` — solo en modalidad domicilio

#### `features/checkout/SubstitutionSelector.tsx` — NUEVO
- **Props**: `value: SubstitutionPref | null`, `onChange: (pref: SubstitutionPref) => void`
- **UI**: 3 radio buttons — "Llámame", "Producto similar", "Eliminar del pedido"
- **Behavior**: Nada se puede avanzar sin seleccionar una opción

#### `features/checkout/checkoutStore.ts` — ACTUALIZADO
- **State**: `deliveryMode`, `timeSlot`, `address`, `lat?`, `lng?`, `substitutionPref`, `customerName`, `isSubmitting`
- **Actions**: `setDeliveryMode()`, `setSubstitutionPref()`, `setSubmitting()`, `reset()`
- **Hook derivado**: `useIsDeliveryReady()` — gate del step de entrega con guard `address.trim()` para domicilio
- **Persistencia**: NINGUNA (store efímero, sin middleware `persist`)

#### `features/checkout/DeliverySelector.tsx` — ACTUALIZADO
- Fix: `setTimeout` para focus reemplazado por `useEffect`
- Comentarios estructurales removidos (código más limpio)

#### `features/checkout/SubstitutionSelector.tsx` — ACTUALIZADO
- Fix double-fire: removido `onClick` redundante en `<label>` (conflicto con `htmlFor` + `onChange`)

#### `features/checkout/shipping.ts` — NUEVO
```typescript
interface ShippingQuote {
  cost: number          // 0 si es gratis
  isFree: boolean       // true cuando subtotal >= FREE_SHIPPING_THRESHOLD
  freeThreshold: number // umbral configurado (útil para "te faltan $X")
}
// Regla: subtotal >= 30_000 → gratis; subtotal < 30_000 → $3_000
function calculateShipping(subtotal: number): ShippingQuote
```
- Pura, sin dependencias de UI ni stores
- Configurable vía `FREE_SHIPPING_THRESHOLD` y `STANDARD_SHIPPING_COST` en `config/app.ts`

#### `features/orders/OrderDetailPage.tsx` — NUEVO
- **Ruta**: `/pedidos/:orderId`
- **Data**: `orderService.getById(orderId)` vía React Query, `refetchInterval: 5000` (polling simulado)
- **UI**: Número de orden, `OrderTimeline`, botón WhatsApp prellenado

#### `features/orders/OrderTimeline.tsx` — NUEVO
- **Props**: `currentStatus: OrderStatus`
- **Estados**: `received` → `confirmed` → `preparing` → `ready` → `delivered`
- **UI**: Stepper vertical con animación CSS en el estado activo

#### `features/orders/OrdersPage.tsx` — REEMPLAZAR placeholder
- **Data**: `orderService.list(userId)` vía React Query — `queryKey: ['orders', userId]`, `enabled: !!userId`
- **UI**: Lista de pedidos del usuario (orderId, fecha, total, estado). Si está vacío: CTA "Ir al catálogo"

#### `features/catalog/pages/CatalogLandingPage.tsx` — NUEVO
- **Ruta**: `/catalog` (sin id)
- **Data**: `useCategories()` — ordenadas por `order`
- **UI**: Grid `3 cols sm:4 lg:5` de tarjetas con PNG circular, nombre y link a `/catalog/:slug`
- **Destino**: CTA "Comprar en Maui" del HeroCarousel slide 1 y "Ver todas las categorías" en Home

#### `features/catalog/pages/SearchPage.tsx` — NUEVO
- **Ruta**: `/search?q=...`
- **Data**: `useProducts()` — filtrado client-side por query param `q`
- **Búsqueda**: normaliza acentos (`NFD + /[\u0300-\u036f]/`), busca en `name`, `name_display`, `name_legal`
- **UI**: Skeleton mientras carga, grid de `ProductCard`, estado vacío con mensaje y CTA al home

#### `shared/components/layout/ComingSoonPage.tsx` — NUEVO
- **Rutas**: `/ofertas`, `/favoritos` (y cualquier futura ruta sin contenido)
- **Props**: `title: string`, `description?: string`, `icon?: LucideIcon`
- **UI**: Ícono centrado, mensaje "Próximamente", botón "Volver al inicio"

### MAUI-PWA-customers — Modificaciones

#### `features/catalog/mockData.ts` — ACTUALIZAR
- Reemplazar productos ficticios con ~15 productos reales de Leche y Miel
- Confirmar pasillos reales con el aliado antes del deploy
- Formato de imagen: WebP 400×400px < 30KB

#### `stores/authStore.ts` — ACTUALIZAR
```typescript
// Agregar cuando VITE_DEMO_MODE=true:
const DEMO_USER: User = {
  id: 'demo-user-001',
  name: 'Usuario Demo',
  phone: '+573001234567',
  isAuthenticated: true,
}
```
- Si `VITE_DEMO_MODE=true`: inicializar el store con `DEMO_USER` directamente (sin flujo de login)

#### `features/cart/CartPage.tsx` — FIX
- Cambiar CTA de "Confirmar pedido" → "**Pedir mi Mercado**"
- Agregar `FloatingCartBar` si no está ya en el layout

#### `config/app.ts` — ACTUALIZAR
- `WHATSAPP_SUPPORT_NUMBER`: reemplazar por número real de Leche y Miel
- `WHATSAPP_ORDER_NUMBER`: número para notificaciones de pedidos

#### `stores/cartStore.ts` — ACTUALIZADO
- **Nueva acción**: `updateKilos(productId, kilos)` — si `kilos <= 0` llama `removeItem`; else actualiza `CartItem.kilos` con `roundKg(kilos)`
- **`calcTotals`**: usa `kilos ?? 1` para `is_variable_weight`; `quantity` para el resto
- **`addItem`**: acumula kilos en el mismo ítem si ya existe (`roundKg((i.kilos ?? 0) + item.kilos)`)
- **Helper interno**: `roundKg = (v) => parseFloat(v.toFixed(2))` (evita errores de punto flotante)
- **`lastUpdated`**: nuevo campo para lógica de `clearIfStale` (30 días)

#### `shared/utils/formatPrice.ts` — NUEVO
- `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`
- Consolida 3 copias locales que existían en `ProductDetailSheet`, `CartPage` y `CheckoutPage`

#### `stores/themeStore.ts` — NUEVO
- Zustand `persist` (key: `maui-theme`). `theme: 'light' | 'dark'`, `toggleTheme()`, `setTheme(t)`

#### `shared/components/ui/ThemeToggle.tsx` — NUEVO
- Botón `Sun`/`Moon` (Lucide) con `aria-label` y `aria-pressed`. Estilos `bg-brand-primary/10`

#### `shared/hooks/useThemeSync.ts` — NUEVO
- `useEffect` que sincroniza `document.documentElement.classList.toggle('dark', theme === 'dark')` cuando cambia `themeStore.theme`

#### `hooks/useCart.ts` — ACTUALIZADO
- Expone `updateKilos` junto a las demás acciones del `cartStore`

### MAUI-PWA-customers — Nuevos archivos de servicio

#### `services/mockOrderService.ts` — NUEVO
```typescript
// Implementa OrderService
const mockOrderService: OrderService = {
  async submit(payload: OrderPayload): Promise<OrderConfirmation> {
    await delay(1200) // simula latencia 3G
    const orderId = `MAUI-${Date.now()}`
    const order: Order = { orderId, status: 'received', ...payload }
    saveToLocalStorage('maui-orders', orderId, order)
    return { orderId, status: 'received', estimatedTotal: calculateTotal(payload.items) }
  },
  async getById(orderId: string): Promise<Order> {
    await delay(800)
    return readFromLocalStorage('maui-orders', orderId)
  },
  async list(_userId?: string): Promise<Order[]> {
    await delay(600)
    return readAllFromLocalStorage('maui-orders')
    // userId ignorado en mock — en producción filtraría por usuario en el backend
  }
}
```

**Seed de historial demo**: Al cargar por primera vez (`SEED_MARKER_KEY` ausente en localStorage), `mockOrderService` genera 3 pedidos de ejemplo en estados `delivered`, `ready` y `preparing` con modalidades variadas, para que `OrdersPage` tenga contenido visible en la demo sin que el usuario complete un flujo primero.

#### `services/index.ts` — NUEVO
```typescript
export const orderService: OrderService =
  import.meta.env.VITE_DEMO_MODE === 'true'
    ? mockOrderService
    : realOrderService // será el import real en Sprint 1
```

### MAUI-PWA-customers — Router

```typescript
// Rutas completas (iteración 2026-06-11):
{ path: '/',                  element: <Home /> }
{ path: '/catalog',           element: <CatalogLandingPage /> }  // grid 9 pasillos
{ path: '/catalog/:categoryId', element: <CatalogPage /> }
{ path: '/search',            element: <SearchPage /> }          // ?q= query param
{ path: '/ofertas',           element: <ComingSoonPage title="Ofertas" icon={Tag} /> }
{ path: '/favoritos',         element: <ComingSoonPage title="Favoritos" icon={Heart} /> }
{ path: '/checkout',          element: <CheckoutPage /> }
{ path: '/pedidos/:orderId',  element: <OrderDetailPage /> }
{ path: '/cart',              element: <CartPage /> }
{ path: '/pedidos',           element: <OrdersPage /> }
{ path: '/auth',              element: <AuthPage /> }
{ path: '*',                  element: <NotFound /> }
```

---

## maui-admin-front — Scaffold desde cero

### Stack
Mismo que MAUI-PWA-customers: **React 19 + TypeScript + Vite + TailwindCSS**

### Estructura de archivos

```
maui-admin-front/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx               ← Router principal
    ├── types/
    │   └── order.ts          ← Tipos compartidos (mismos que PWA)
    ├── lib/
    │   └── localStorage.ts   ← Helpers read/write maui-orders
    ├── features/
    │   └── orders/
    │       ├── OrdersList.tsx        ← Lista de pedidos
    │       ├── OrderDetail.tsx       ← Detalle + botones transición
    │       ├── StatusBadge.tsx       ← Badge de estado por color
    │       ├── WhatsAppLink.tsx      ← Link prellenado por estado
    │       └── DemoSimulator.tsx     ← Auto-avance cada 20s
    └── config/
        └── whatsapp.ts       ← Templates de mensajes por estado
```

### Rutas del admin

```
/           → OrdersList (lista de pedidos)
/pedido/:id → OrderDetail (detalle y controles)
```

### Lógica de comunicación

```typescript
// lib/localStorage.ts
const ORDERS_KEY = 'maui-orders'

export function getOrders(): Order[] {
  const raw = localStorage.getItem(ORDERS_KEY)
  return raw ? Object.values(JSON.parse(raw)) : []
}

export function updateOrderStatus(orderId: string, newStatus: OrderStatus): void {
  const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '{}')
  orders[orderId] = { ...orders[orderId], status: newStatus, updatedAt: new Date().toISOString() }
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
}
```

### Mensajes de WhatsApp por estado

```typescript
// config/whatsapp.ts
const MESSAGES: Record<OrderStatus, (name: string, orderId: string) => string> = {
  confirmed: (n, id) => `Hola ${n}, ya recibimos su pedido ${id} 🛒`,
  preparing: (n, id) => `Hola ${n}, estamos preparando su pedido ${id} 📦`,
  ready:     (n, id) => `Hola ${n}, su mercado ${id} está listo para entrega 🎉`,
  delivered: (n, id) => `Hola ${n}, su pedido ${id} fue entregado. ¡Gracias! 🙏`,
}
```

### DemoSimulator

```typescript
// features/orders/DemoSimulator.tsx
// Avanza el estado del pedido activo cada 20 segundos
// Estados en orden: received → confirmed → preparing → ready → delivered
// Se activa/desactiva con un botón "▶ Demo en vivo"
```

---

## REST API Contracts

> Esta feature no expone ni consume endpoints REST reales — toda comunicación es via `mockOrderService` (localStorage). Los contratos a continuación son los que el `mockOrderService` **simula** y que el `realOrderService` implementará en el Sprint 1 de backend.

| Operación | Método | Path | Mock |
|-----------|--------|------|------|
| Crear pedido | POST | `/orders` | `mockOrderService.submit()` — delay 1200ms |
| Obtener pedido | GET | `/orders/:id` | `mockOrderService.getById()` — delay 800ms |
| Listar pedidos | GET | `/orders` | `mockOrderService.list()` — delay 600ms |

**Request — POST /orders**:
```json
{
  "items": [{ "id": "prod-001", "qty": 2, "priceAtMoment": 4500 }],
  "substitutionPreference": "call_me",
  "deliveryType": "pickup",
  "deliveryData": { "timeSlot": "morning" },
  "customerName": "Doña Carmen"
}
```

**Response — 201 Created**:
```json
{
  "orderId": "MAUI-1748859600000",
  "status": "received",
  "estimatedTotal": 9000
}
```

---

## Data Model

### Interfaces compartidas (mismas en PWA y admin)

```typescript
// ─── Catálogo (definidas en src/types/catalog.ts) ─────────────────────────

// Producto del catálogo de un aliado
interface Product {
  id: string
  name: string
  price: number
  unit: string
  imageUrl: string
  categoryId: string          // FK a Category.id
  inStock: boolean
  is_variable_weight: boolean
  // opcionales
  name_display?: string       // nombre corto UI
  name_legal?: string         // nombre largo recibos
  originalPrice?: number      // precio tachado
  badge?: string
  currency?: string
  description?: string
  nutritionalInfo?: {
    calories?: string
    protein?: string
    fat?: string
    carbs?: string
    fiber?: string
  }
  availability?: string       // "Disponible" | "Pocas unidades" | "Agotado"
}

// Catálogo del aliado: agrupaciones de producto (pasillos)
interface Category {
  id: string
  name: string
  icon?: string
  slug?: string
  illustrationUrl?: string    // PNG circular 96×96 ("Categorías principales" Home)
  order?: number
}

// Plataforma MAUI: vertical de plataforma (sidebar)
interface BusinessCategory {
  id: string
  name: string
  iconName: string            // resuelto vía BCAT_ICON_REGISTRY a LucideIcon
  slug: string | null         // null = no navega aún
  comingSoon: boolean
}

// Plataforma MAUI: agrupación de verticales (sección colapsable del sidebar)
interface BusinessCategoryGroup {
  id: string
  label: string               // "Comprar" | "Servicios" | "Comunidad" | ...
  order: number
  items: BusinessCategory[]
}

// ─── Pedidos (definidas en src/types/order.ts) ────────────────────────────

// Ítem en el carrito (definido en src/types/cart.ts)
interface CartItem {
  productId: string
  name: string
  imageUrl: string
  price: number
  price_at_moment: number
  unit: string
  quantity: number
  is_variable_weight: boolean
  kilos?: number              // solo para is_variable_weight === true
}

// Contrato del servicio de pedidos
interface OrderService {
  submit(payload: OrderPayload): Promise<OrderConfirmation>
  getById(orderId: string): Promise<Order>
  list(userId?: string): Promise<Order[]>  // userId para filtrar en producción; mock lo ignora
}

// Payload enviado al crear un pedido
interface OrderPayload {
  items: Array<{ id: string; qty: number; priceAtMoment: number }>
  substitutionPreference: 'call_me' | 'similar' | 'remove'
  deliveryType: 'pickup' | 'delivery'
  deliveryData: {
    address?: string
    lat?: number
    lng?: number
    timeSlot?: 'morning' | 'afternoon' | 'asap'
  }
  customerName: string
}

// Respuesta al crear pedido
interface OrderConfirmation {
  orderId: string      // formato demo: MAUI-{timestamp}
  status: 'received'
  estimatedTotal: number
}

// Estado completo del pedido
type OrderStatus = 'received' | 'confirmed' | 'preparing' | 'ready' | 'delivered'

interface Order {
  orderId: string
  status: OrderStatus
  items: CartItem[]
  deliveryType: 'pickup' | 'delivery'
  substitutionPreference: string
  customerName: string
  estimatedTotal: number
  createdAt: string
  updatedAt?: string
}
```

---

## Environment Variables

### MAUI-PWA-customers

| Variable | Valor demo | Valor producción |
|----------|-----------|-----------------|
| `VITE_DEMO_MODE` | `"true"` | `"false"` |
| `VITE_API_URL` | no requerida en demo | URL del backend real |

Archivo: `MAUI-PWA-customers/.env.demo`
```
VITE_DEMO_MODE=true
```

### maui-admin-front

| Variable | Valor |
|----------|-------|
| `VITE_WHATSAPP_NUMBER` | número real de L&M |

---

## File Structure (estado actual tras iteración 2026-06-08)

> **Path correction**: el repo fue aplanado (`client/src/` → `src/`) en commit `ebcf57b`.

```
MAUI-PWA-customers/src/
├── features/
│   ├── catalog/
│   │   ├── pages/
│   │   │   ├── Home.tsx                       ← REDISEÑADA (sidebar + 4 secciones + carrusel)
│   │   │   └── CatalogPage.tsx                ← implementado (useProducts sin args + filtro)
│   │   ├── components/
│   │   │   ├── HeroCarousel.tsx               ← implementado
│   │   │   ├── ProductDetailSheet.tsx         ← NUEVO (reemplaza ProductDetailModal.tsx, eliminado)
│   │   │   ├── ProductCard.tsx                ← REFACTORED (iteración 2026-06-10)
│   │   │   ├── QuantityStepper.tsx            ← implementado
│   │   │   └── VariableWeightSheet.tsx        ← ACTUALIZADO (kg, createPortal, initialKilos)
│   │   ├── pages/
│   │   │   ├── Home.tsx                       ← REDISEÑADA
│   │   │   ├── CatalogPage.tsx                ← implementado
│   │   │   ├── CatalogLandingPage.tsx         ← NUEVO (grid 9 pasillos, ruta /catalog)
│   │   │   └── SearchPage.tsx                 ← NUEVO (ruta /search?q=, filtra mockProducts)
│   │   └── mockData.ts                        ← incluye mockBusinessCategoryGroups + mockFeaturedProducts; categoryIds resueltos
│   │
│   ├── checkout/
│   │   ├── CheckoutPage.tsx                   ← SIMPLIFICADO (iteración 2026-06-10)
│   │   ├── DeliverySelector.tsx               ← ACTUALIZADO (useEffect, sin setTimeout)
│   │   ├── SubstitutionSelector.tsx           ← ACTUALIZADO (fix double-fire)
│   │   ├── checkoutStore.ts                   ← ACTUALIZADO (+useIsDeliveryReady)
│   │   └── shipping.ts                        ← NUEVO (calculateShipping, ShippingQuote)
│   │
│   ├── orders/
│   │   ├── pages/
│   │   │   ├── OrdersPage.tsx
│   │   │   └── OrderDetailPage.tsx
│   │   ├── OrderTimeline.tsx
│   │   └── ReorderBanner.tsx                  ← existe (no en spec original)
│   │
│   ├── auth/
│   │   └── pages/AuthPage.tsx
│   │
│   └── cart/
│       └── pages/CartPage.tsx
│
├── shared/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── RootLayout.tsx                 ← implementado
│   │   │   ├── Header.tsx                     ← ACTUALIZADO (desktop nav /ofertas /favoritos con useLocation)
│   │   │   ├── Footer.tsx                     ← ACTUALIZADO (rediseño visual 2026-06-10)
│   │   │   ├── ComingSoonPage.tsx             ← NUEVO (reutilizable; /ofertas, /favoritos)
│   │   │   └── BottomNavBar.tsx               ← ACTUALIZADO (slide-out via uiStore.bottomSheetOpen)
│   │   └── ui/
│   │       └── ThemeToggle.tsx                ← NUEVO (Sun/Moon, aria-pressed)
│   ├── hooks/
│   │   ├── useProductQuantity.ts              ← ACTUALIZADO (expone kilos)
│   │   └── useThemeSync.ts                    ← NUEVO (toggle .dark en documentElement)
│   └── utils/
│       └── formatPrice.ts                     ← NUEVO (Intl.NumberFormat es-CO centralizado)
│
├── hooks/
│   └── useCatalog.ts                          ← useProducts · useFeaturedProducts
│                                                useCategories · useBusinessCategoryGroups
│
├── types/
│   ├── catalog.ts                             ← Product · Category · BusinessCategory · BusinessCategoryGroup
│   └── order.ts                               ← Order · OrderPayload · OrderStatus
│
├── stores/
│   ├── authStore.ts                           ← DEMO_USER cuando VITE_DEMO_MODE=true
│   ├── cartStore.ts                           ← ACTUALIZADO (updateKilos, calcTotals kg, roundKg)
│   ├── themeStore.ts                          ← NUEVO (Zustand persist, light|dark)
│   └── uiStore.ts                            ← ACTUALIZADO (bottomSheetOpen)
│
├── services/
│   ├── mockOrderService.ts
│   ├── index.ts                               ← VITE_DEMO_MODE switch
│   └── api.ts
│
├── assets/
│   ├── categories/ (9 PNG: bebidas, congelados, despensa, electro,
│   │                herramientas, jugueteria, lacteos, limpieza, snacks)
│   ├── hero/ (hero-parque.png, hero-supermercado-abarrotes.png)
│   ├── banners/ahorra-maui-plus.png
│   └── promos/envio-gratis.png
│
├── config/
│   └── app.ts                                 ← WHATSAPP_SUPPORT_NUMBER
│
└── App.tsx                                    ← Router con lazy + RootLayout wrapper
```

---

## React Query Configuration

| Hook | staleTime | refetchInterval | Source |
|------|-----------|-----------------|--------|
| `useProducts()` (sin args; filtro por `categoryId` en `CatalogPage`) | 5 min | — | `mockData.ts` |
| `useFeaturedProducts()` (filtro `inStock` en mock) | 5 min | — | `mockData.ts` |
| `useCategories()` | 10 min | — | `mockData.ts` |
| `useBusinessCategoryGroups()` | 10 min | — | `mockData.ts` |
| `useOrder(orderId)` | 0 | 5000ms (polling) | `mockOrderService.getById` |
| `useOrders()` | 0 | — | `mockOrderService.list` |

> Todos los hooks viven en `src/hooks/useCatalog.ts` (catálogo) o consumen `orderService` directamente desde los componentes (pedidos).

---

## Security

No aplica servicios externos en el demo. Consideraciones relevantes:
- `DEMO_USER` solo se activa cuando `VITE_DEMO_MODE=true` (variable de build-time)
- El número real de WhatsApp de L&M va en `config/app.ts` — no en código cliente expuesto a usuarios de producción cuando `DEMO_MODE=false`
- El localStorage no contiene datos sensibles — solo ordenes simuladas

---

## Performance

| Objetivo | Estrategia |
|----------|-----------|
| Carga <4s en 3G | Code splitting por ruta (Vite lazy imports), imágenes WebP < 30KB |
| Cache offline | Service Worker Workbox — CacheFirst para assets, StaleWhileRevalidate para mockData |
| No re-renders innecesarios | Zustand selectores atómicos, React Query cache |

---

## Deployment Strategy

| App | Método | Trigger |
|-----|--------|---------|
| MAUI-PWA-customers (demo) | `vite build --mode demo` → deploy estático (Netlify / Vercel / S3) | Manual antes de sesión Fase 2 |
| maui-admin-front | `vite build` → mismo host, diferente path o subdominio | Manual antes de sesión Fase 2 |

`.env.demo`:
```
VITE_DEMO_MODE=true
```

---

## Testing Strategy

> **Prototype mode**: Tests automáticos omitidos por decisión explícita. La validación de calidad se realiza con los escenarios E2E-1 a E2E-6 de la spec funcional, ejecutados manualmente antes del deploy.

### Unit Tests

> Omitidos — prototype mode. Target de cobertura: 0% (no aplica).

### Integration Tests

> Omitidos — prototype mode. El `mockOrderService` actúa como integration test implícito del contrato de datos.

### E2E Tests

> Omitidos como tests automatizados. Ver spec funcional §Critical E2E Test Scenarios para el protocolo de validación manual (E2E-1 a E2E-6).

---

## Stages

| Stage | Status | Approved By | Approved At |
|-------|--------|-------------|-------------|
| functional | approved | Nixon Gamboa | 2026-06-02T06:34:22Z |
| technical | approved | Nixon Gamboa | 2026-06-02T06:52:00Z |
| technical (re-iteración Home/Layout/Taxonomía DD-5, DD-6) | iterated | Nixon Gamboa | 2026-06-08 |
| technical (iteración ProductDetailSheet, peso variable kg, dark mode, shipping, checkout simplify) | iterated | Nixon Gamboa | 2026-06-10 |
| technical (iteración routing completo: CatalogLandingPage, SearchPage, ComingSoonPage; mockOrderService seed + userId list; PasillosGrid eliminado; Header desktop nav corrected) | iterated | Nixon Gamboa | 2026-06-11 |
| tasks | approved | Nixon Gamboa | 2026-06-02T07:05:00Z |
| implementation | in-progress | — | — |
