# Plan: MAUI — Roadmap de Features (SDD)

## Context
El proyecto es una PWA de e-commerce (React 19 + TypeScript + Vite) ya refactorizada con arquitectura limpia (types, stores Zustand, React Query, PWA). El objetivo es construir la app completa descrita en `tareas/backlogDeProducto_AppClientes.md` usando Spec-Driven Development (SDD) con `/meli.*` commands, una feature a la vez.

**Stack decidido:**
- Frontend: React 19 + TypeScript + Vite + TailwindCSS + Zustand + React Query (existente)
- Backend: AWS SAM + Node.js/TypeScript + API Gateway + Lambda + DynamoDB
- Estructura: **Monorepo** — frontend en raíz, backend en `/backend/`
- Auth: WhatsApp Magic Link (Evolution API / WPPConnect)
- Hosting: S3 + CloudFront (frontend) + API Gateway (backend)

---

## Estructura Monorepo Target

```
MAUI-PWA-master/
├── client/                   ← Frontend React (mover desde raíz)
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig*.json
│
└── server/                   ← NUEVO — AWS SAM backend
    ├── functions/            ← Lambdas por dominio
    │   ├── auth/
    │   ├── catalog/
    │   ├── orders/
    │   └── notifications/
    ├── layers/               ← Shared utils (DB client, auth middleware)
    ├── infra/                ← DynamoDB table definitions, otros recursos
    ├── template.yaml         ← SAM template
    ├── samconfig.toml
    └── package.json          ← Backend deps (aws-sdk, etc.)
```

**Nota de migración:** El código frontend actual (raíz → `src/`, `public/`, `package.json`, etc.) se mueve a `client/`. Esto requiere actualizar paths relativos en configs. Se hace como primer paso antes de FEAT-001.

**Deployment (independiente por workspace):**
- `client/` → `npm run build` → `client/dist/` → **S3 + CloudFront**
- `server/` → `sam build && sam deploy` → **Lambda + API Gateway**

---

## Roadmap de Features (Orden SDD)

### Step 0 — Migración de Estructura (pre-features)

Antes de iniciar cualquier feature SDD, mover el frontend a `client/`:

1. Crear carpeta `client/` en la raíz
2. Mover a `client/`: `src/`, `public/`, `index.html`, `package.json`, `package-lock.json`, `vite.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`
3. Actualizar `client/vite.config.ts`: alias `@` apunta a `./src` (sin cambio relativo)
4. Actualizar `client/package.json`: scripts sin cambios
5. Crear `package.json` raíz con workspaces: `["client", "server"]` y scripts proxy (`"dev": "npm run dev -w client"`, `"build": "npm run build -w client"`)
6. Verificar: `npm run dev` desde raíz levanta el frontend correctamente

---

### Sprint 0 — Frontend Puro (sin backend)

Estas features no necesitan API. Se construyen primero para validar UX mientras se prepara el backend.

#### FEAT-001: Cart Persistence
**Tipo:** Frontend
**Scope:**
- Añadir `zustand/middleware` `persist` a `cartStore.ts` → localStorage key `maui-cart`
- Stub de `validateCartPrices()` que en el futuro llamará a la API (por ahora no-op)
- Toast/banner cuando el carrito se restaura al abrir la app
- Limpiar carrito persistido si tiene >30 días
- **Agregar `inStock: boolean` (default `true`) al tipo `Product` en `src/types/catalog.ts` y al mock data desde este sprint.** Todos los componentes que muestran productos deben leer este flag desde el inicio para que el comportamiento sea correcto antes de conectar la API real.

---

#### FEAT-002: Store Status Banner
**Tipo:** Frontend (config estática primero, API después)
**Scope:**
- Banner en Home que muestra estado (Abierto/Cerrado) + horario de despacho
- Config en `src/config/app.ts`: `STORE_SCHEDULE` (días y horas)
- Componente `StoreStatusBanner` — verde si abierto, rojo si cerrado
- Lógica de cálculo de estado basada en hora local del cliente
- Preparado para recibir estado desde API (prop override)

---

#### FEAT-003: Catalog Page (Listado por Pasillo)
**Tipo:** Frontend
**Scope:**
- Ruta `/catalog/:categoryId` con `CatalogPage` component
- Grid de productos del pasillo seleccionado, filtrado por `categoryId`
- Skeleton Loaders por tarjeta (replicar forma exacta del card: imagen, texto, botón)
- Botón `+` full-width en la base de cada card. Grande, pulgar-friendly.
- Badge condicional: si `is_variable_weight === true` → mostrar `"Peso y precio final se ajustan en tienda"` en naranja
- Si `inStock === false`: ocultar botón `+`, mostrar label gris `"Agotado"`
- Barra Flotante de Canasta: aparece con animación solo cuando `cart.count >= 1`
- `padding-bottom` en el grid para que la barra flotante no tape el último card
- Navega desde el grid de Pasillos en Home al hacer click en una categoría

---

#### FEAT-003b: Search Page
**Tipo:** Frontend
**Scope:**
- Ruta `/search?q=` con `SearchPage` component
- Filtro local sobre `useProducts()` por nombre/descripción (mientras no hay API de búsqueda)
- Resultados en grid, empty state, skeleton loader
- Integrar con `useUIStore.searchQuery` + `useNavigate` desde `Header`
- `useSearch` hook mejorado: debounce 500ms, mínimo 2 chars (búsqueda local sobre catálogo en memoria, no peticiones por keystroke)

---

#### FEAT-004: Product Detail
**Tipo:** Frontend
**Scope:**
- Modal centrado (no página separada) al hacer click en `ProductCard`
- Muestra: imagen grande, nombre, precio, unidad, badge
- **Etiqueta de variabilidad:** si `product.isPriceVariable === true` → texto "Precio final depende del peso exacto"
- Botón "Agregar al carrito" con contador de cantidad (+/-)
- Cerrar con ESC, click fuera, o botón X
- Añadir campos `is_variable_weight: boolean`, `name_display?: string`, `name_legal?: string` al tipo `Product`

---

### Sprint 1 — Backend Foundation

#### FEAT-005: AWS Backend Setup
**Tipo:** Backend (infraestructura)
**Scope:**
- Crear `/backend/` con estructura SAM
- `template.yaml` con: API Gateway HTTP API, tablas DynamoDB (`Users`, `Products`, `Orders`), Lambda layer `shared` (DB client, response helpers)
- Función `/ping` → `GET /ping` retorna `{ status: 'ok', timestamp }`
- `samconfig.toml` con environments: `dev`, `prod`
- Script npm en raíz: `"backend:dev"`, `"backend:deploy"`
- `backend/.env.example` con vars: `DYNAMODB_TABLE_USERS`, `WHATSAPP_API_URL`, etc.

**DynamoDB Tables:**
```
Users:    PK=phone               | phone, name, address, createdAt
Products: PK=productId           | name, price, unit, imageUrl, categoryId, name_display, name_legal, is_variable_weight (bool), badge, inStock (bool, default true)
Orders:   PK=orderId, SK=userId  | items[{id, qty, price_at_moment}], status, total_estimated, delivery_type, delivery_data{address,lat,lng,time_slot}, substitution_pref, customer_name, createdAt, photoUrl
Categories: PK=categoryId        | name, icon
```

---

#### FEAT-006: Catalog API Integration
**Tipo:** Full-stack
**Scope:**
- Backend: `GET /catalog/products`, `GET /catalog/categories`, `GET /catalog/campaigns`
- Lambda que lee de DynamoDB, retorna paginado (cursor-based)
- **La API filtra `inStock === false` antes de retornar** — productos agotados nunca llegan al cliente
- Seed script para cargar mockData actuales en DynamoDB
- Frontend: `useCatalog.ts` hooks apuntan a `fetchJson('/catalog/products')` en vez de mock
- Loading/error states ya existen → solo cambiar queryFn
- Añadir campo `inStock: boolean` al tipo `Product` en `client/src/types/catalog.ts`
- **Regla crítica:** `MostOrderedSection` y secciones de ofertas/destacados solo muestran productos donde `inStock === true`. Si el Admin Panel marca un producto como "Agotado" (`inStock: false`), desaparece automáticamente de todas las secciones al próximo refresco de React Query (staleTime: 5min)

---

### Sprint 2 — Autenticación

#### FEAT-007: Auth Magic Link
**Tipo:** Full-stack
**Scope:**
- Backend:
  - `POST /auth/request` — recibe `{ phone }`, genera JWT temporal (15min), envía link por WhatsApp via Evolution API/WPPConnect
  - `GET /auth/verify?token=XYZ` — valida token, retorna JWT de sesión (30 días), crea/actualiza usuario en DynamoDB
- Frontend:
  - `AuthPage` actualizada: input teléfono → estado "Te enviamos un link por WhatsApp"
  - Nueva ruta `/login?token=XYZ` — `LoginCallbackPage` que llama `/auth/verify` y redirige a `/`
  - JWT guardado en `localStorage` (key: `maui-token`)
  - `authStore.ts` completado: `login(phone)`, `verifyToken(token)`, `logout()`
  - Auth guard: `/checkout` requiere auth → redirect a `/auth?redirect=/checkout`
- Mensaje WhatsApp: `"¡Hola! Toca aquí para entrar a MAUI: https://maui.app/login?token=XYZ — Válido por 15 minutos"`

---

### Sprint 3 — Checkout

#### FEAT-008: Checkout Flow
**Tipo:** Frontend + Backend parcial
**Scope:**
- Ruta `/checkout` protegida (requiere auth)
- Step 1: Resumen de carrito (readonly)
- Step 2: Modalidad:
  - **Recoger en tienda:** selector de slot de hora (config: slots disponibles del día actual)
  - **Domicilio:** campo dirección + botón "Usar mi ubicación" (Geolocation API)
- Componentes: `CheckoutPage`, `DeliverySelector`, `TimeSlotPicker`, `AddressInput`
- Estado en `checkoutStore` (nuevo Zustand store)

---

#### FEAT-009: Substitution & Order Confirmation
**Tipo:** Full-stack
**Scope:**
- Step 3 en checkout: selector de preferencia de sustitución (radio buttons):
  1. "Llamarme por teléfono"
  2. "Cambiar por similar (marca/precio)"
  3. "No enviar y descontar"
- `POST /orders` con `{ items, deliveryMode, address?, pickupSlot?, substitutionPreference }`
- Backend genera `orderId`, guarda en DynamoDB, retorna `{ orderId, status: 'received' }`
- `OrderConfirmationPage` (`/order/:orderId`): éxito + orderId + mensaje de confirmación
- Limpiar carrito después de confirmar

---

### Sprint 4 — Post-venta

#### FEAT-010: Orders Page + Timeline
**Tipo:** Full-stack
**Scope:**
- Backend: `GET /orders` (lista del usuario autenticado), `GET /orders/:orderId`
- Ruta del monitor: `/pedido/[order_hash]` — NanoID, no ID incremental (seguridad)
- Frontend:
  - `OrdersPage` actualizada (de placeholder a funcional)
  - `OrderTimeline` component: 5 estados — `Recibido → Preparando → Listo/Pesado → En camino → Entregado`. Transición animada automática.
  - Sincronización: **Por definir** (ver grow.md TODO Realtime). Canal primario = notificación WhatsApp desde Lambda. Mientras tanto: polling pasivo 30s en el cliente como fallback seguro. La arquitectura AWS se ajusta a la necesidad, no al revés.
  - Sin conexión: mostrar último estado conocido desde caché + aviso "Sin conexión — Mostrando última actualización"
  - Comparación de precios: `order_snapshot` vs `final_tally`; diferencia >10% → resaltar en naranja
  - WhatsApp con mensaje pre-llenado: `"...pedido #[hash] en estado [estado_actual]"`
  - Estado cancelado: alerta roja + botón de llamada directa a la tienda
  - Link desde `OrderConfirmationPage` → `/pedido/[order_hash]`

---

#### FEAT-011: "Mis Pedidos Anteriores" (plantilla de carrito)
**Tipo:** Frontend
**Estado:** DESHABILITADA en MVP. Ver grow.md TODO para la versión correcta.
**Scope (post-MVP):**
- Sección en Home visible **solo** si usuario autenticado con al menos 1 pedido anterior
- Muestra lista de pedidos pasados con fecha y total estimado
- El usuario elige cuál usar como plantilla → carga items en carrito para **edición manual**, nunca automática
- Usa `GET /orders` ya implementado (FEAT-010)
- Animación de entrada con `animate-fade-in`

---

#### FEAT-012: Order Photo & WhatsApp Notifications
**Tipo:** Full-stack
**Scope:**
- Photo display: cuando `order.status === 'ready'`, mostrar foto del pedido en `OrderDetailPage` (URL desde S3)
- Backend: `PUT /orders/:orderId/photo` → genera presigned URL de S3; thumbnail WebP ~50KB para carga inicial + imagen full para Lightbox
- Bucket S3 con acceso solo via presigned URLs temporales (nunca acceso público)
- WhatsApp Notifications:
  - Lambda trigger en DynamoDB Streams al cambiar `status`
  - Notificar: "Empacando", "Listo" (con total ajustado), "En Camino"
  - Reutiliza Evolution API/WPPConnect de FEAT-007

---

## Orden de Dependencias

```
FEAT-001 (Cart Persist)         → independiente  ← agrega inStock al tipo Product
FEAT-002 (Store Banner)         → independiente
FEAT-003 (Catalog Page)         → necesita FEAT-001 (inStock ya en tipo)
FEAT-003b (Search Page)         → independiente
FEAT-004 (Product Detail)       → independiente
         ↓
FEAT-005 (Backend Setup)        → base para todo el backend
         ↓
FEAT-006 (Catalog API)          → necesita FEAT-005
         ↓
FEAT-007 (Auth Magic Link)      → necesita FEAT-005; desbloquea checkout
         ↓
FEAT-008 (Checkout Flow)        → necesita FEAT-007
         ↓
FEAT-009 (Substitution+Confirm) → necesita FEAT-008
         ↓
FEAT-010 (Orders Timeline)      → necesita FEAT-009
FEAT-011 ("Lo de siempre")      → necesita FEAT-010
FEAT-012 (Photo + Notif)        → necesita FEAT-010 + S3
```

---

## Workflow SDD por Feature

Para cada feature ejecutar en orden:
```
/meli.start FEAT-XXX: <nombre>
/meli.spec              ← functional spec + technical spec
/meli.plan              ← tasks breakdown + effort
/meli.build             ← implementación layer por layer
/meli.check             ← validación y tests
/meli.finish            ← archiva, listo para PR
```

---

## Verificación General

Después de cada feature:
1. `npm run dev` — sin errores en consola
2. `npm run build` — build limpio
3. `npm run lint` — 0 warnings
4. `npm run test` — tests pasan
5. Backend (FEAT-005+): `sam local start-api` — endpoints responden
6. Navegación manual de los flujos del feature
