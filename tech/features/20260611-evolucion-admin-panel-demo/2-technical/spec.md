# Technical Specification — evolucion-admin-panel-demo

**Feature**: Evolución de `maui-admin-front` para cerrar el loop de la demo.
**Idioma**: Español (es)
**Tipo**: MVP — frontend web (React 19 + Vite 7)
**Fecha**: 2026-06-11
**Spec funcional**: `1-functional/spec.md`

---

## 1. Resumen ejecutivo

Se evoluciona la PWA admin manteniendo el stack actual (React 19 + Vite 7 + RR DOM 7 + Tailwind 3 + lucide-react). Se introduce una **capa de mock repositories** que reemplaza al `lib/localStorage.ts` actual; cada repository expone una `interface` TypeScript que el backend real implementará en Sprint 1 (swap por feature flag `VITE_DEMO_MODE`). Storage queda **híbrido**: `maui-orders` compartido con el PWA (para que los pedidos viajen en demo same-device); resto de claves con namespace `maui-admin-*` para aislar auth, catálogo, store-status, merchant config y audit. Detección de pedidos nuevos vía `storage` event cross-tab (sin polling). Tipos del dominio se replican manualmente desde el PWA y un script de check valida drift en CI/local.

---

## 2. Stack confirmado

```yaml
language: TypeScript ~5.8.3
framework: React 19.1.0
bundler: Vite 7.1.7
routing: react-router-dom 7.9.3
styling: tailwindcss 3.4.15
icons: lucide-react ^0.575.0
state: React state + Context API (no Redux/Zustand)
storage: window.localStorage + storage event
audio: HTMLAudioElement (asset estático en /public)
print: window.print() + CSS @media print
clipboard: navigator.clipboard.writeText
testing: vitest + @testing-library/react (a añadir)
linter: eslint (config existente)
typecheck: tsc --noEmit (script existente)
package_manager: pnpm (workspace raíz del repo)
node: >= 20
```

> No se introducen libs nuevas más allá de `vitest` + `@testing-library/react` + `jsdom` para tests críticos.

---

## 3. Arquitectura lógica

```
┌─────────────────────────────────────────────────────────────────┐
│  App (BrowserRouter)                                            │
│  ├── AuthProvider  (sessionStorage maui-admin-session)          │
│  ├── ToastProvider                                              │
│  └── Routes                                                     │
│       ├── /login                       → LoginPage              │
│       ├── /  (RequireAuth)             → AppShell               │
│       │     ├── /              → DashboardPage  (owner+operator)│
│       │     ├── /pedidos       → OrdersListPage (operator+)     │
│       │     ├── /pedidos/:id   → OrderDetailPage                │
│       │     ├── /historico     → HistoricoPage                  │
│       │     ├── /catalogo      → CatalogoPage (owner)           │
│       │     ├── /categorias    → CategoriasPage (owner)         │
│       │     ├── /tienda        → TiendaPage (owner)             │
│       │     ├── /configuracion → ConfigPage (owner)             │
│       │     └── /auditoria     → AuditPage (owner)              │
│       └── *                            → NotFound               │
│                                                                 │
│  ── Capa de servicios (swap por VITE_DEMO_MODE) ──              │
│   services/index.ts                                             │
│     ├─ mockOrderRepository    ↔ localStorage 'maui-orders'      │
│     ├─ mockCatalogRepository  ↔ localStorage 'maui-admin-catalog'│
│     ├─ mockStoreStatusRepo    ↔ localStorage 'maui-admin-store' │
│     ├─ mockAuthRepository     ↔ sessionStorage + env users      │
│     ├─ mockMerchantRepo       ↔ localStorage 'maui-admin-merchant'│
│     └─ mockAuditRepository    ↔ localStorage 'maui-admin-audit' │
│                                                                 │
│  ── Sync cross-tab ──                                           │
│   useStorageSubscription(key) → window 'storage' event          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Estructura de carpetas

```
maui-admin-front/src/
├── App.tsx
├── main.tsx
├── index.css
├── config/
│   ├── app.ts                     ← constantes generales + VITE_*
│   ├── whatsapp.ts                ← (existe) — se mueve a merchantRepo en runtime
│   └── audio.ts                   ← rutas a /sounds/new-order.mp3
├── types/                          ← ⚠ replicado desde PWA + script de check
│   ├── orderService.ts
│   ├── catalog.ts
│   ├── cart.ts
│   ├── auth.ts                    ← AdminUser, Role, Session
│   ├── storeStatus.ts             ← StoreStatusOverride, WeeklySchedule
│   ├── merchant.ts                ← MerchantConfig
│   └── audit.ts                   ← AuditEvent
├── services/
│   ├── index.ts                   ← swap por VITE_DEMO_MODE
│   ├── delay.ts                   ← helper randomDelay(300, 800)
│   ├── mockOrderRepository.ts
│   ├── mockCatalogRepository.ts
│   ├── mockStoreStatusRepository.ts
│   ├── mockAuthRepository.ts
│   ├── mockMerchantRepository.ts
│   ├── mockAuditRepository.ts
│   └── seed/
│       ├── catalogSeed.ts         ← datos iniciales catálogo
│       ├── ordersSeed.ts          ← 3 pedidos demo (idempotente con marker)
│       ├── usersSeed.ts           ← owner + operator
│       ├── merchantSeed.ts        ← Leche y Miel defaults
│       └── runAllSeeds.ts         ← entry idempotente
├── auth/
│   ├── AuthContext.tsx
│   ├── RequireAuth.tsx            ← role-aware
│   └── useSession.ts
├── shell/
│   ├── AppShell.tsx               ← header + sidebar + outlet
│   ├── Sidebar.tsx                ← items filtrados por rol
│   └── EnableSoundGate.tsx        ← primer click → habilita Web Audio
├── features/
│   ├── dashboard/
│   │   └── DashboardPage.tsx
│   ├── orders/
│   │   ├── OrdersListPage.tsx     ← tabs + búsqueda + badge
│   │   ├── OrderDetailPage.tsx    ← pesos + cancel + WhatsApp
│   │   ├── PickingListView.tsx    ← print + copy
│   │   ├── StatusBadge.tsx        (existe — se mueve aquí)
│   │   ├── WhatsAppLink.tsx       (existe — se mueve aquí)
│   │   ├── NewOrderAlert.tsx      ← banner + sonido
│   │   └── useNewOrdersWatcher.ts ← storage event hook
│   ├── historico/
│   │   └── HistoricoPage.tsx
│   ├── catalogo/
│   │   ├── CatalogoPage.tsx
│   │   ├── ProductFormModal.tsx
│   │   └── StockToggle.tsx
│   ├── categorias/
│   │   └── CategoriasPage.tsx
│   ├── tienda/
│   │   └── TiendaPage.tsx         ← override + horario semanal
│   ├── configuracion/
│   │   ├── ConfigPage.tsx         ← merchant editable + reset demo
│   │   └── ResetDemoButton.tsx
│   ├── auditoria/
│   │   └── AuditPage.tsx
│   └── login/
│       └── LoginPage.tsx
├── ui/                             ← componentes compartidos
│   ├── Tabs.tsx, Toast.tsx, Modal.tsx, ConfirmDialog.tsx,
│   ├── Spinner.tsx, EmptyState.tsx, PriceInput.tsx, WeightInput.tsx
└── lib/
    ├── format.ts                   ← formatCOP, formatDate
    ├── audio.ts                    ← playNewOrderSound + enable gate
    ├── print.ts                    ← printElement(id)
    └── clipboard.ts                ← copyText
```

> El `lib/localStorage.ts` actual se **elimina** y sus consumidores migran a `mockOrderRepository`. El `features/orders/DemoSimulator.tsx` se mantiene como herramienta interna apuntando al nuevo repo.

---

## 5. Tipos compartidos con el PWA

### 5.1 Estrategia: replicación + script de check

Se mantienen los tipos del dominio replicados literalmente en `maui-admin-front/src/types/` desde `MAUI-PWA-customers/src/types/`. Para detectar drift:

`scripts/check-types-drift.sh`:
```bash
#!/usr/bin/env bash
set -eo pipefail
ROOT="$(git rev-parse --show-toplevel)"
PWA="$ROOT/MAUI-PWA-customers/src/types"
ADMIN="$ROOT/maui-admin-front/src/types"
FILES=(orderService.ts catalog.ts cart.ts)
for f in "${FILES[@]}"; do
  if ! diff -q "$PWA/$f" "$ADMIN/$f" > /dev/null; then
    echo "❌ drift detected: types/$f"
    diff -u "$PWA/$f" "$ADMIN/$f" || true
    exit 1
  fi
done
echo "✓ types in sync"
```

Se añade al script `predev` y al `prebuild` del admin:
```json
"predev": "bash ../scripts/check-types-drift.sh",
"prebuild": "bash ../scripts/check-types-drift.sh"
```

### 5.2 Fix urgente: drift actual

El `types/order.ts` actual del admin **no tiene `userId`**. Acción en la primera tarea de build: **eliminar `types/order.ts`** y reemplazar por copia exacta de `orderService.ts` del PWA. El consumer (`OrdersList.tsx`, `OrderDetail.tsx`) ya usa los campos compatibles.

### 5.3 Extensiones que NO van en tipos compartidos

Los siguientes son del admin únicamente:

```ts
// types/auth.ts
export type Role = 'owner' | 'operator'   // viewer descartado del scope demo
export interface AdminUser { email: string; name: string; role: Role; merchantId: string }
export interface Session   { user: AdminUser; expiresAt: string /* ISO */ }

// types/storeStatus.ts
export type StoreOverride = 'auto' | 'open' | 'closed'
export interface DayHours { open: string /* "08:00" */; close: string /* "20:00" */; closed: boolean }
export interface WeeklySchedule { mon: DayHours; tue: DayHours; wed: DayHours; thu: DayHours; fri: DayHours; sat: DayHours; sun: DayHours }
export interface StoreStatus { override: StoreOverride; schedule: WeeklySchedule; updatedAt: string }

// types/merchant.ts
export interface MerchantConfig { merchantId: string; name: string; whatsapp: string; address: string; updatedAt: string }

// types/audit.ts
export type AuditAction = 'order.status_changed' | 'order.cancelled' | 'order.weights_set' | 'catalog.product_upsert' | 'catalog.product_delete' | 'catalog.stock_toggled' | 'store.override_changed' | 'store.schedule_changed' | 'merchant.config_changed' | 'auth.login' | 'auth.logout'
export interface AuditEvent { id: string; user: string; action: AuditAction; targetId?: string; meta?: Record<string, unknown>; at: string }
```

### 5.4 Extensiones a `CartItem` para pesos reales

El wire format actual `{id, qty, priceAtMoment}` se mantiene. Para pesos reales se extiende **en la misma interface** (PWA y admin):

```ts
// types/orderService.ts (replicada en ambos)
export interface CartItem {
  id: string
  qty: number
  priceAtMoment: number
  is_variable_weight?: boolean   // ← nuevo, opcional para backward-compat
  kilosRequested?: number        // ← lo que pidió el cliente (PWA)
  kilosReal?: number             // ← lo que pesó el operator (admin)
}

export interface Order {
  // ... campos existentes
  customerPhone?: string          // ← nuevo, dígitos sin espacios (ej "573015550101")
}
```

Esto requiere actualizar el tipo en el **PWA primero** (ver TASK-001 del plan). El script de check valida que ambos están sincronizados. `customerPhone` se almacena normalizado a sólo dígitos con prefijo de país (sin `+`, sin espacios) para que `wa.me/{phone}` funcione directo.

---

## 6. Capa de servicios mock — contratos

Cada repository define su **interface** primero; el mock implementa esa interface; el `services/index.ts` exporta la implementación según `VITE_DEMO_MODE`.

### 6.1 `OrderRepository`

```ts
export interface OrderRepository {
  list(filter?: { status?: OrderStatus; q?: string; from?: string; to?: string }): Promise<Order[]>
  getById(orderId: string): Promise<Order>
  updateStatus(orderId: string, next: OrderStatus, by: string): Promise<Order>
  setRealWeights(orderId: string, weights: Array<{ itemId: string; kilos: number }>, by: string): Promise<Order>
  cancel(orderId: string, reason: string, by: string): Promise<Order>
}
```

- Persiste en `localStorage['maui-orders']` (compartido con PWA).
- `setRealWeights` recalcula `estimatedTotal` con `qty * priceAtMoment` para items normales y `kilosReal * priceAtMoment` (precio por kilo) para variables. La fórmula se documenta como **RN-3 técnica**: para variables `priceAtMoment` se interpreta como **precio por kg**.
- `updateStatus` y `cancel` registran evento en `mockAuditRepository`.
- Delay: `randomDelay(300, 800)`.

### 6.2 `CatalogRepository`

```ts
export interface CatalogRepository {
  listProducts(filter?: { categoryId?: string; q?: string }): Promise<Product[]>
  getProduct(id: string): Promise<Product | null>
  upsertProduct(p: Product): Promise<Product>
  deleteProduct(id: string): Promise<void>
  toggleStock(id: string, inStock: boolean): Promise<Product>
  listCategories(): Promise<Category[]>
  upsertCategory(c: Category): Promise<Category>
  deleteCategory(id: string): Promise<void>
}
```

- Persiste en `localStorage['maui-admin-catalog']` con shape `{ products: Record<id,Product>; categories: Record<id,Category> }`.
- `imageUrl` se admite como URL placeholder (`https://picsum.photos/...` o data-URL). No se sube nada.
- Toda mutación → audit event.

### 6.3 `StoreStatusRepository`

```ts
export interface StoreStatusRepository {
  get(): Promise<StoreStatus>
  setOverride(override: StoreOverride, by: string): Promise<StoreStatus>
  setSchedule(schedule: WeeklySchedule, by: string): Promise<StoreStatus>
  isOpenNow(now?: Date): Promise<boolean>   // deriva de override + schedule
}
```

- Persiste en `localStorage['maui-admin-store']`.

### 6.4 `AuthRepository`

```ts
export interface AuthRepository {
  login(email: string, password: string): Promise<Session>
  logout(): Promise<void>
  getSession(): Session | null    // síncrono — lee sessionStorage
}
```

- Lee usuarios desde `VITE_ADMIN_USERS` (JSON con `[{email,password,name,role,merchantId}, ...]`) con fallback hardcoded (`owner@lechemiel.demo` / `demo1234`, `operator@lechemiel.demo` / `demo1234`).
- Sesión en `sessionStorage['maui-admin-session']` con `expiresAt = now + 8h`.
- `getSession()` retorna `null` si está expirada o no existe.
- `login` y `logout` registran audit.

### 6.5 `MerchantRepository`

```ts
export interface MerchantRepository {
  get(merchantId: string): Promise<MerchantConfig>
  update(cfg: MerchantConfig, by: string): Promise<MerchantConfig>
}
```

- Persiste en `localStorage['maui-admin-merchant']`.
- Reemplaza al `config/whatsapp.ts` actual: los componentes leen el `whatsapp` del merchant config en lugar de la constante.

### 6.6 `AuditRepository`

```ts
export interface AuditRepository {
  log(event: Omit<AuditEvent,'id'|'at'>): Promise<void>
  list(limit?: number): Promise<AuditEvent[]>
}
```

- Persiste en `localStorage['maui-admin-audit']` como array.
- **FIFO 500 entradas** (RN-10): si llega a 500, descarta el más viejo.

### 6.7 Swap por feature flag

```ts
// services/index.ts
const isDemo = import.meta.env.VITE_DEMO_MODE !== 'false'

export const orderRepo: OrderRepository    = isDemo ? mockOrderRepository    : realOrderRepository
export const catalogRepo: CatalogRepository = isDemo ? mockCatalogRepository : realCatalogRepository
// ...
```

`realOrderRepository` no se implementa en esta feature pero el archivo se crea como stub `throw new Error('not implemented')` para validar el contrato.

---

## 7. Routing y autorización

### 7.1 Guard

```tsx
// auth/RequireAuth.tsx
export function RequireAuth({ role, children }: { role?: Role | Role[]; children: React.ReactNode }) {
  const { session } = useSession()
  const location = useLocation()
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  if (role) {
    const allowed = Array.isArray(role) ? role : [role]
    if (!allowed.includes(session.user.role)) {
      return <Navigate to="/" replace />   // + toast "Sin permiso"
    }
  }
  return <>{children}</>
}
```

### 7.2 Tabla de rutas y permisos

| Ruta | owner | operator |
|------|:-:|:-:|
| `/login` | público | público |
| `/` (dashboard) | ✅ | ✅ |
| `/pedidos` | ✅ | ✅ |
| `/pedidos/:id` | ✅ | ✅ |
| `/historico` | ✅ | ✅ |
| `/catalogo` · `/categorias` | ✅ | ❌ |
| `/tienda` | ✅ | ❌ |
| `/configuracion` | ✅ | ❌ |
| `/auditoria` | ✅ | ❌ |

---

## 8. State management

- **Auth**: `AuthContext` (React Context) — `{session, login, logout}`.
- **Toasts**: `ToastContext` — minimal queue (3 toasts max).
- **Sound enabled**: state en `AppShell` + flag en `sessionStorage['maui-admin-sound-enabled']` para no volver a pedir gesto durante la sesión.
- **Páginas de datos**: state local + `useEffect` que llama al repo; no se introduce React Query ni Zustand.
- **Sync cross-tab**: hook `useStorageSubscription(keys: string[], onChange: () => void)` que escucha `window.addEventListener('storage', ...)`. Las páginas se re-fetchen al disparar.

---

## 9. Storage layout

| Clave | Owner | Compartido con PWA | Shape resumido |
|-------|-------|:-:|----------------|
| `maui-orders` | mockOrderRepository | ✅ | `Record<orderId, Order>` |
| `maui-orders-seeded-v1` | seed PWA | ✅ | marker `"1"` |
| `maui-admin-catalog` | mockCatalogRepository | ❌ | `{products,categories}` |
| `maui-admin-catalog-seeded-v1` | seed admin | ❌ | marker |
| `maui-admin-store` | mockStoreStatusRepository | ❌ | `StoreStatus` |
| `maui-admin-merchant` | mockMerchantRepository | ❌ | `MerchantConfig` |
| `maui-admin-audit` | mockAuditRepository | ❌ | `AuditEvent[]` |
| `maui-admin-users-seeded-v1` | seed admin | ❌ | marker |
| `sessionStorage['maui-admin-session']` | mockAuthRepository | ❌ | `Session` |
| `sessionStorage['maui-admin-sound-enabled']` | AppShell | ❌ | `"1"` |
| `sessionStorage['maui-admin-known-order-ids']` | NewOrderAlert | ❌ | `string[]` (para no re-alertar) |

> El seed del admin **NO** toca `maui-orders` (lo escribe el PWA cuando hace su propio seed). Para demo same-device, el PWA se carga primero o se siembra desde su propio seed; el admin queda observando esa key. Si el admin se carga primero y `maui-orders` está vacío, simplemente muestra empty state — esto es el comportamiento esperado (el PWA es source-of-truth para pedidos).

---

## 10. Detección de pedidos nuevos (cross-tab)

`useNewOrdersWatcher` (en `features/orders/`):

```ts
export function useNewOrdersWatcher(onNew: (order: Order) => void) {
  useEffect(() => {
    const known = new Set<string>(
      JSON.parse(sessionStorage.getItem('maui-admin-known-order-ids') ?? '[]')
    )
    const tick = async () => {
      const all = await orderRepo.list()
      for (const o of all) {
        if (!known.has(o.orderId)) {
          known.add(o.orderId)
          if (o.status === 'received') onNew(o)
        }
      }
      sessionStorage.setItem('maui-admin-known-order-ids', JSON.stringify([...known]))
    }
    tick()  // initial
    const handler = (e: StorageEvent) => {
      if (e.key === 'maui-orders') tick()
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [onNew])
}
```

**Limitación aceptada (R-8 técnico)**: `storage` event NO se dispara en la misma pestaña que escribió. Implica que si la PWA y el admin están en la misma pestaña (no es el caso de demo), el admin no se entera. La demo se ejecuta con PWA y admin en **pestañas distintas** del mismo navegador, escenario donde el evento sí dispara.

`onNew` dispara `playNewOrderSound()` + push a `NewOrderAlert` banner.

---

## 11. Audio (alerta sonora)

- Asset: `/public/sounds/new-order.mp3` (libre, ~1s).
- `lib/audio.ts`:
```ts
let audio: HTMLAudioElement | null = null
let enabled = sessionStorage.getItem('maui-admin-sound-enabled') === '1'
export function enableSound() {
  enabled = true
  sessionStorage.setItem('maui-admin-sound-enabled', '1')
  audio = new Audio('/sounds/new-order.mp3')
}
export function playNewOrderSound() {
  if (!enabled || !audio) return
  audio.currentTime = 0
  audio.play().catch(() => { /* política del browser ignoró */ })
}
```
- `EnableSoundGate` muestra banner "Habilitar alertas" hasta el primer click; `enableSound()` se llama en el handler de click (gesto de usuario requerido por la política del browser).

---

## 12. Captura de pesos reales (UI)

`features/orders/OrderDetailPage.tsx`:

- Para cada `item` con `is_variable_weight: true`:
  - Mostrar `<WeightInput value={item.kilosReal ?? item.kilosRequested ?? 0} suggested={item.kilosRequested} onChange=... />`.
  - Mostrar recálculo en vivo: `Subtotal = kilosReal * priceAtMoment` (precio por kg).
- Botón **"Marcar como listo"** queda `disabled` si existe algún item variable sin `kilosReal`.
- Al avanzar a `ready` → llama `orderRepo.setRealWeights(...)` y luego `orderRepo.updateStatus(...,'ready',...)`.

---

## 13. WhatsApp, impresión y clipboard

- **WhatsApp**: `WhatsAppLink` ahora lee `whatsapp` desde `merchantRepo.get(session.user.merchantId)` (no de la constante). Mensajes prellenados por estado (recibido, listo, entregado, cancelado con motivo).
- **Print**: `PickingListView` envuelto en `<div id="picking-print">`; CSS `@media print { body * { visibility: hidden } #picking-print, #picking-print * { visibility: visible } }`. Botón "Imprimir" llama `window.print()`.
- **Copy**: botón "Copiar como texto" → genera plano `customerName / dirección / items con cantidades y pesos` → `navigator.clipboard.writeText(...)`.

---

## 14. Seed idempotente

`services/seed/runAllSeeds.ts` se importa en `main.tsx` antes de `<App />`:

```ts
runAllSeeds()  // catalog, users, merchant, store-status — cada uno con su propio marker
```

- Catalog seed: ~20 productos cubriendo lácteos, abarrotes, carnes, bebidas — incluye al menos 3 `is_variable_weight: true` (queso campesino, frijol, chorizo).
- Users seed: owner + operator desde `VITE_ADMIN_USERS` o fallback.
- Merchant seed: `Leche y Miel`, WhatsApp y dirección actuales de `config/whatsapp.ts`.
- StoreStatus seed: override `auto`, schedule semanal abierto 8-20 lun-sáb, dom cerrado.
- Cada seed usa marker `maui-admin-<dominio>-seeded-v1` para idempotencia.

`ResetDemoButton` (en `/configuracion`, solo owner) limpia **todas** las claves `maui-admin-*` + `maui-orders-seeded-v1` + `maui-orders` y recarga. Confirmación previa con `ConfirmDialog`.

---

## 15. Estrategia de testing

Project type = MVP, `coverage_target: critical paths only`. Se añade vitest + @testing-library/react + jsdom.

**Cobertura objetivo**: cada mock repository + las páginas con lógica crítica.

| Capa | Test | Por qué |
|------|------|---------|
| `mockOrderRepository.setRealWeights` | unit | Lógica de recálculo es la regla de negocio más sensible |
| `mockOrderRepository.cancel` | unit | Motivo obligatorio + audit |
| `mockAuthRepository` | unit | Expiración 8h, roles, fallback de env |
| `mockStoreStatusRepository.isOpenNow` | unit | Lógica de horario semanal |
| `mockAuditRepository` | unit | FIFO 500 |
| `RequireAuth` | RTL | Redirect y bloqueo por rol |
| `useNewOrdersWatcher` | RTL + storage event simulado | Detección sin dobles alertas |
| `OrderDetailPage` (pesos) | RTL | Botón disabled hasta capturar pesos |
| Script `check-types-drift.sh` | bash test | Fail si modifico solo un lado |

E2E no aplica (project_type mvp, e2e_enabled=false).

---

## 16. ADRs

### ADR-001 — Storage híbrido (orders compartido, resto aislado)
**Decisión**: `maui-orders` se comparte con el PWA; auth/catalog/store/merchant/audit usan namespace `maui-admin-*`.
**Por qué**: para la demo same-device el operator debe ver los pedidos que crea el cliente en el PWA en tiempo real; al mismo tiempo, catálogo/auth/horarios son responsabilidad del admin y no deben pisarse con datos del PWA. El backend real en Sprint 1 reemplaza ambos lados por las mismas interfaces.
**Alternativas descartadas**:
- Todo compartido: catálogo del admin pisaría al del PWA y viceversa.
- Todo aislado: los pedidos del PWA nunca llegan al admin → demo rota.

### ADR-002 — Replicación de tipos + script de check vs paquete workspace
**Decisión**: replicación literal de archivos `types/*.ts` con script `check-types-drift.sh` ejecutado en `predev`/`prebuild`.
**Por qué**: introducir un paquete `shared/` requiere migrar a pnpm workspaces y reconfigurar TS path mapping en ambos proyectos. Para una feature de demo el costo no se justifica; el script bloquea el drift con 30 líneas de bash.
**Alternativas descartadas**: workspace paquete (mucho tooling), solo comentario (drift actual demuestra que no funciona).

### ADR-003 — Sólo `storage` event, sin polling
**Decisión**: detección de pedidos vía `window.storage` event.
**Por qué**: la demo se ejecuta con PWA y admin en **pestañas distintas del mismo navegador**, escenario donde el evento dispara cross-tab. Polling agregaría CPU y carga al GC sin beneficio en ese escenario.
**Limitación aceptada**: si admin y PWA quedaran en la misma pestaña (single-page composición) el evento no dispara. No es el caso de la demo (R-8).

### ADR-004 — Sin React Query / Zustand
**Decisión**: state local con `useState` + Context para auth/toasts.
**Por qué**: la demo tiene <10 pantallas y data flow trivial. Añadir React Query agrega 13kb gzipped y un concept extra (queries/mutations) sin ROI claro en este alcance.

### ADR-005 — Vitest + Testing Library mínimos vs Playwright
**Decisión**: solo unit + integration con vitest.
**Por qué**: project_type=mvp con `e2e_enabled=false`. Los flujos críticos (pesos, auth, audit, watcher) son testables a nivel de unidad/Componente sin levantar browser.

### ADR-006 — `priceAtMoment` se interpreta como **precio por kg** en items variables
**Decisión**: para items con `is_variable_weight: true`, el campo `priceAtMoment` del wire representa precio por kg; subtotal del item = `kilosReal * priceAtMoment`.
**Por qué**: evita introducir un nuevo campo `pricePerKg` en el contrato y mantiene una sola fuente de precio para auditar.
**Riesgo**: si el PWA enviara `priceAtMoment` como "precio del paquete pedido", el cálculo del admin sería incorrecto. Mitigación: documentar la convención en JSDoc del tipo `CartItem` y añadir test cruzado en `mockOrderService` del PWA.

### ADR-007 — Dos contextos de WhatsApp: cliente vs aliado
**Decisión**: existen dos números distintos con dos casos de uso distintos. La constante hardcoded actual `config/whatsapp.ts` (número del aliado) se traslada a `MerchantRepository` y queda visible solo en `/configuracion` y footer. El número usado para coordinar pedidos desde `OrderDetail` es **`order.customerPhone`** (cliente).
**Por qué**: el flujo real del operator en hora pico es Admin→Cliente (avisar listo, pedir confirmar sustitución). Mostrar el WhatsApp del aliado como CTA principal en el detalle confundía: enviaría mensaje al propio negocio. El WhatsApp del aliado queda como dato de configuración (CU-13) y referencia pública.
**Implementación**:
- `WhatsAppLink` recibe `phone: string` por prop — no asume origen.
- `OrderDetailPage` pasa `customerPhone` para el CTA principal y `tel:{phone}` como acción secundaria.
- `ConfigPage` y footer leen `merchant.whatsapp` y muestran como "Contacto del aliado".
- Si `order.customerPhone` está vacío (pedido legacy del seed sin teléfono), se oculta el CTA de WhatsApp y se muestra hint "Sin teléfono en el pedido".

### ADR-008 — Búsqueda por últimos 4 dígitos del teléfono
**Decisión**: la búsqueda de pedidos en `OrdersListPage` matchea sobre customerName, orderId, customerPhone completo **y los últimos 4 dígitos** (input numérico de 4 chars → match suffix).
**Por qué**: en hora pico con 10+ pedidos en cola, el operator recibe llamada del cliente y necesita identificar el pedido en segundos. Tipear el teléfono completo en una tablet es lento; tipear 4 dígitos es 2 segundos. Los últimos 4 son únicos en una jornada típica de Leche y Miel (< 50 pedidos/día).
**Implementación**:
- Si query es exactamente 4 dígitos: match por `phone.endsWith(query)`.
- Si query es >4 dígitos: match por `phone.includes(query)`.
- Si query no es numérico: match por `customerName` (case-insensitive) y `orderId`.
- En la lista, cada row muestra `Juan G. · ...4521` cuando hay teléfono — reconocimiento visual sin abrir el detalle.

---

## 17. Plan de migración (orden seguro)

1. Crear `services/`, `auth/`, `shell/` vacíos.
2. Copiar tipos del PWA → `types/` y configurar script de check.
3. **Extender `CartItem` en PWA** con campos opcionales `is_variable_weight`, `kilosRequested`, `kilosReal` (no rompe nada — son opcionales).
4. Re-copiar al admin; check pasa.
5. Implementar repos mock (orders primero — refactor del `lib/localStorage.ts` actual).
6. Migrar `OrdersList` y `OrderDetail` actuales a `pages/` y consumir `orderRepo`.
7. Implementar `AuthRepository` + `RequireAuth` + `LoginPage` + `AppShell` + `Sidebar`.
8. Resto de páginas (Dashboard → Tienda → Catálogo → Categorías → Histórico → Audit → Config).
9. `NewOrderAlert` + `EnableSoundGate` al final (depende de que pedidos funcionen).
10. Tests críticos por capa.

---

## 18. Riesgos técnicos

| # | Riesgo | Mitigación |
|---|--------|------------|
| RT-1 | El script de check no detecta cambios semánticos (ej. cambiar el significado de un campo sin cambiar el tipo) | Aceptado; el ADR-006 documenta convenciones; revisión humana en PR |
| RT-2 | `storage` event no llega si admin y PWA están en la misma pestaña | Documentado en walkthrough; demo usa pestañas distintas |
| RT-3 | `setRealWeights` con cálculo `kilosReal * priceAtMoment` falla si el PWA cambia la convención del wire | Test cruzado + JSDoc + ADR-006 |
| RT-4 | `sessionStorage` no se sincroniza cross-tab → cada pestaña tiene su sesión | Aceptado; la demo opera con una sola pestaña admin |
| RT-5 | Tamaño del `maui-admin-catalog` crece y satura localStorage | Catálogo de demo < 50 productos; tope de pragmatismo |
| RT-6 | Pre-build con script de check rompe CI del PWA si el admin no se actualiza simultáneamente | El script se ejecuta solo en `maui-admin-front`; el PWA no depende de él |
| RT-7 | `Audio()` falla en browsers con autoplay-policy estricta hasta gesto | `EnableSoundGate` resuelve; documentado en R-3 funcional |
| RT-8 | (Ver realtime) | Ver ADR-003 |

---

## 19. Out of scope técnico

- Web Push API: la US-13 funcional la deja como "opcional"; en esta iteración se entrega solo audio + banner.
- PWA install (manifest) del admin: no necesario para la demo.
- Multi-tenant real: `merchantId` queda como placeholder en sesión y merchant config; no hay router por tenant.
- Real auth: Cognito + JWT explícitamente fuera (R-6 funcional).
- E2E en Playwright: ver ADR-005.

---

## 20. Referencias

- Spec funcional: `1-functional/spec.md`
- Análisis PO: `docs/rq-PO-admin-panel-fase0.md`
- Tipos PWA: `MAUI-PWA-customers/src/types/orderService.ts`, `catalog.ts`, `cart.ts`
- Mock de referencia: `MAUI-PWA-customers/src/services/mockOrderService.ts`
- Código admin actual: `maui-admin-front/src/` (App.tsx, lib/localStorage.ts, features/orders/, types/order.ts)
