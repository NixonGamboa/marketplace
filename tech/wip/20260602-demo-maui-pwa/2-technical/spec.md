# Technical Specification — demo-maui-pwa
<!-- Tech SDD Kit | Language: es | Generated: 2026-06-02 -->

---

## Executive Summary

Esta feature completa el frontend de la PWA MAUI Customers (brownfield, ~55% construido) y scaffoldea el panel admin demo desde cero en `maui-admin-front/`. Ambas apps comparten `localStorage` como mecanismo de comunicación. No hay backend — toda la capa de datos usa `mockOrderService` con delays que simulan 3G.

**Apps afectadas**:
- `MAUI-PWA-customers/client/` — PWA React 19 existente
- `maui-admin-front/` — Panel admin nuevo (Vite + React 19 + TypeScript + TailwindCSS)

**Principio de swapeo**: Al llegar el Sprint 1 de backend, el único cambio es reemplazar `mockOrderService` por `realOrderService` en `services/index.ts`. Ningún componente requiere modificación.

---

## Architecture Overview

### Vista general del sistema (demo)

```
         MAUI-PWA-customers (PWA Cliente)
         ┌──────────────────────────────────────────┐
         │  React 19 + Vite + React Router DOM v7   │
         │                                          │
         │  features/catalog  features/checkout     │
         │  features/orders   features/auth         │
         │  features/cart                           │
         │                                          │
         │  stores: cartStore · checkoutStore       │
         │          authStore · uiStore             │
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
                   ProductCard / ProductDetailModal
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

## Component Architecture

### MAUI-PWA-customers — Nuevos componentes

#### `features/catalog/CatalogPage.tsx` — NUEVO
- **Ruta**: `/catalog/:categoryId`
- **Props**: `categoryId` (desde `useParams`)
- **Data**: `useProducts({ categoryId })` — React Query, `staleTime: 5min`
- **UI**: Grid de `ProductCard`, skeleton loaders mientras carga, estado vacío si no hay productos
- **Behavior**: Al tocar una card → abre `ProductDetailModal`

#### `features/catalog/ProductDetailModal.tsx` — NUEVO
- **Props**: `product: Product`, `isOpen: boolean`, `onClose: () => void`
- **UI**: Modal centrado, imagen WebP 400×400, nombre, precio/unidad, botón de agregar con contador (+/-), botón cerrar
- **Behavior**: Llama `cartStore.addItem()`, muestra quantity actual en el counter

#### `features/checkout/CheckoutPage.tsx` — NUEVO
- **Ruta**: `/checkout`
- **Steps (un solo scroll/página)**:
  1. Resumen del carrito (items, totales, link "Seguir comprando")
  2. `DeliverySelector` (pickup / domicilio)
  3. `SubstitutionSelector` (radio buttons)
  4. CTA "Pedir mi Mercado" (bloqueado hasta que los 3 steps previos estén completos)
- **On submit**: `checkoutStore.setSubmitting(true)` → `orderService.submit(payload)` → `cartStore.clearCart()` → `router.replace('/orden/:orderId')`
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

#### `features/checkout/checkoutStore.ts` — NUEVO
- **State**: `deliveryMode`, `timeSlot`, `address`, `lat?`, `lng?`, `substitutionPref`, `customerName`, `isSubmitting`
- **Actions**: `setDeliveryMode()`, `setSubstitutionPref()`, `setSubmitting()`, `reset()`
- **Persistencia**: NINGUNA (store efímero, sin middleware `persist`)

#### `features/orders/OrderDetailPage.tsx` — NUEVO
- **Ruta**: `/orden/:orderId`
- **Data**: `orderService.getById(orderId)` vía React Query, `refetchInterval: 5000` (polling simulado)
- **UI**: Número de orden, `OrderTimeline`, botón WhatsApp prellenado

#### `features/orders/OrderTimeline.tsx` — NUEVO
- **Props**: `currentStatus: OrderStatus`
- **Estados**: `received` → `confirmed` → `preparing` → `ready` → `delivered`
- **UI**: Stepper vertical con animación CSS en el estado activo

#### `features/orders/OrdersPage.tsx` — REEMPLAZAR placeholder
- **Data**: `orderService.list()` vía React Query
- **UI**: Lista de pedidos del usuario (orderId, fecha, total, estado). Si está vacío: CTA "Ir al catálogo"

### MAUI-PWA-customers — Modificaciones

#### `features/catalog/mockData.ts` — ACTUALIZAR
- Reemplazar productos ficticios con ~15 productos reales de Leche y Miel
- Confirmar pasillos reales con el aliado antes del deploy
- Formato de imagen: WebP 400×400px < 30KB

#### `features/auth/authStore.ts` — ACTUALIZAR
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
  async list(): Promise<Order[]> {
    await delay(600)
    return readAllFromLocalStorage('maui-orders')
  }
}
```

#### `services/index.ts` — NUEVO
```typescript
export const orderService: OrderService =
  import.meta.env.VITE_DEMO_MODE === 'true'
    ? mockOrderService
    : realOrderService // será el import real en Sprint 1
```

### MAUI-PWA-customers — Router

```typescript
// Agregar a las rutas existentes:
{ path: '/catalog/:categoryId', element: <CatalogPage /> }
{ path: '/checkout',            element: <CheckoutPage /> }
{ path: '/orden/:orderId',      element: <OrderDetailPage /> }

// Mantener existentes:
{ path: '/',        element: <Home /> }
{ path: '/cart',    element: <CartPage /> }
{ path: '/orders',  element: <OrdersPage /> }   // reemplazar contenido
{ path: '/auth',    element: <AuthPage /> }
{ path: '*',        element: <NotFound /> }
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
// Contrato del servicio de pedidos
interface OrderService {
  submit(payload: OrderPayload): Promise<OrderConfirmation>
  getById(orderId: string): Promise<Order>
  list(): Promise<Order[]>
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

Archivo: `MAUI-PWA-customers/client/.env.demo`
```
VITE_DEMO_MODE=true
```

### maui-admin-front

| Variable | Valor |
|----------|-------|
| `VITE_WHATSAPP_NUMBER` | número real de L&M |

---

## File Structure (cambios en MAUI-PWA-customers)

```
MAUI-PWA-customers/client/src/
├── features/
│   ├── catalog/
│   │   ├── CatalogPage.tsx          ← NUEVO
│   │   ├── ProductDetailModal.tsx   ← NUEVO
│   │   ├── mockData.ts              ← ACTUALIZAR con datos reales L&M
│   │   ├── Home.tsx                 ← sin cambios (ya implementado)
│   │   ├── ProductCard.tsx          ← sin cambios
│   │   └── hooks/                   ← sin cambios
│   ├── checkout/                    ← NUEVO directorio completo
│   │   ├── CheckoutPage.tsx
│   │   ├── DeliverySelector.tsx
│   │   ├── SubstitutionSelector.tsx
│   │   └── checkoutStore.ts
│   ├── orders/
│   │   ├── OrdersPage.tsx           ← REEMPLAZAR placeholder
│   │   ├── OrderDetailPage.tsx      ← NUEVO
│   │   └── OrderTimeline.tsx        ← NUEVO
│   ├── auth/
│   │   └── authStore.ts             ← ACTUALIZAR: DEMO_USER
│   └── cart/
│       └── CartPage.tsx             ← FIX: CTA "Pedir mi Mercado"
│
├── services/
│   ├── mockOrderService.ts          ← NUEVO
│   ├── index.ts                     ← NUEVO (VITE_DEMO_MODE switch)
│   └── api.ts                       ← sin cambios
│
├── router/                          ← ACTUALIZAR: agregar 3 rutas nuevas
│
└── config/
    └── app.ts                       ← ACTUALIZAR: WhatsApp real de L&M
```

---

## React Query Configuration

| Hook | staleTime | refetchInterval | Source |
|------|-----------|-----------------|--------|
| `useProducts({ categoryId })` | 5 min | — | `mockData.ts` |
| `useCategories()` | 10 min | — | `mockData.ts` |
| `useOrder(orderId)` | 0 | 5000ms (polling) | `mockOrderService.getById` |
| `useOrders()` | 0 | — | `mockOrderService.list` |

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
| tasks | pending | — | — |
| implementation | pending | — | — |
