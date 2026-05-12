# MAUI Admin — Roadmap de Features

**Proyecto:** MAUI Admin (proyecto independiente)
**Audiencia:** Empleados de "Leche y Miel" — 1-2 personas operando la tienda
**Stack sugerido:** React + TypeScript + Vite + TailwindCSS (misma base que la PWA cliente, facilita reutilización de componentes y tipos compartidos via monorepo)
**Autenticación F&F:** usuario/contraseña hardcodeada — sin infraestructura de auth compleja

> **Estrategia de dos fases:**
> 1. **Sprint DEMO** — El admin se construye primero como demo funcional (FEAT-DEMO-004 en el roadmap del cliente). Usa localStorage/mocks para mostrar el flujo al empleado de la tienda. Objetivo: validar UX operativa antes de invertir en backend.
> 2. **Sprint 1+ (Implementación Real)** — El admin se reconecta a la API real (Lambda + DynamoDB). Los componentes y flujos del demo se reutilizan; solo cambia la capa de datos.
>
> Este roadmap describe la **implementación real** (fase 2). Para el demo, ver `FEAT-DEMO-004` en el roadmap del cliente PWA.

---

## Principios de Diseño del Admin

- **Pantalla grande primero** — el admin opera desde una tablet o PC, no desde el celular del cliente
- **Alertas invasivas** — el empleado tiene clientes físicos y no puede estar pendiente de la pantalla; los nuevos pedidos deben llamar la atención
- **Acciones grandes y claras** — botones de estado del pedido deben ser imposibles de confundir
- **Sin fricción de datos** — no pedir información que ya tiene el sistema
- **WhatsApp como canal de salida** — el admin notifica al cliente desde el panel con un clic

---

## ADMIN-001: Infraestructura Base

**Tipo:** Setup
**Prioridad:** Crítica — bloquea todo lo demás

**Scope:**
- Crear proyecto `admin/` en el monorepo (workspace independiente)
- React + TypeScript + Vite + TailwindCSS
- Auth hardcodeada: variables de entorno `VITE_ADMIN_USER` / `VITE_ADMIN_PASS` (no tocar código para cambiar credenciales)
- Pantalla de login: dos campos + botón, sin decoración
- Ruta protegida: si no hay sesión → redirect a `/login`
- Sesión: `sessionStorage` con flag `admin_authenticated` (expira al cerrar el tab)
- Deploy: S3 bucket separado al del cliente PWA — URL distinta (ej. `admin.maui.com.co`)

---

## ADMIN-002: Lista de Pedidos

**Tipo:** Frontend + Backend
**Prioridad:** Crítica

**Scope:**
- Ruta `/` del Admin — vista principal
- Tabla de pedidos ordenados por `createdAt` descendente (más nuevo arriba)
- Columnas: hora del pedido, nombre del cliente, # items, total estimado, modalidad (domicilio / recojo), estado actual
- Polling automático cada 30 segundos — sin botón de "refrescar"
- **Indicador de nuevo pedido:** cuando llega un pedido con estado `received` creado en los últimos 5 minutos → fila con fondo amarillo/naranja + sonido de alerta (API de Audio del browser)
- Estados representados con colores: `received` (azul), `preparing` (amarillo), `ready` (verde claro), `in_transit` (naranja), `delivered` (verde), `cancelled` (rojo)
- Click en fila → navega al detalle del pedido
- Filtro rápido por estado (tabs: Todos / Nuevos / En Proceso / Entregados)

**Endpoint que consume:**
- `GET /orders?status=&limit=50` — lista de pedidos del día (o últimas 24h)

---

## ADMIN-003: Detalle del Pedido + Cambio de Estado

**Tipo:** Frontend + Backend
**Prioridad:** Crítica

**Scope:**
- Ruta `/orders/:orderId`
- Información del cliente: nombre, teléfono (clickable → abre WhatsApp), dirección / slot de recojo, preferencia de sustitución
- Lista de ítems: nombre, cantidad, unidad, precio unitario, subtotal
  - Si `is_variable_weight === true` → campo de peso real editable (input numérico, ej. `0.850 kg`)
  - Al ingresar peso → recalcula precio del ítem y total del pedido en tiempo real
- Resumen financiero: Total estimado | Total final (calculado con pesos reales)
- **Botones de cambio de estado** — grandes, en la zona inferior de pantalla:
  - `[Confirmar recepción]` → estado `preparing`
  - `[Listo para entrega]` → requiere pesos reales ingresados si hay ítems variables; bloquea si faltan
  - `[En camino]` → estado `in_transit`
  - `[Entregado]` → estado `delivered`
  - `[Cancelar pedido]` → estado `cancelled` + campo de motivo obligatorio
- **Botón WhatsApp prellenado** — aparece en cada transición de estado:
  - Estado `preparing` → "Hola [nombre], ya recibimos su pedido y estamos preparándolo en Leche y Miel."
  - Estado `ready` → "Hola [nombre], su mercado está listo. Total final: $[monto]. En camino en breve."
  - Estado `in_transit` → "Hola [nombre], su mercado ya va en camino. Valor a pagar: $[monto]."
  - Estado `cancelled` → "Hola [nombre], lamentamos que no pudimos procesar su pedido. [motivo]. Comuníquese al [teléfono]."

**Endpoints que consume:**
- `GET /orders/:orderId`
- `PATCH /orders/:orderId/status` → `{ status, note? }`
- `PATCH /orders/:orderId/weights` → `{ items: [{ productId, real_weight_kg }] }`

---

## ADMIN-004: Gestión de Catálogo

**Tipo:** Frontend + Backend
**Prioridad:** Alta — desacopla la carga de productos del proceso de desarrollo

**Objetivo:** El equipo de "Leche y Miel" puede crear, editar y desactivar sus ~100 productos **sin tocar código ni hacer deploy**. El catálogo es propiedad del aliado, no del equipo técnico.

**Scope:**
- Ruta `/catalog` en el Admin
- Listado de productos: nombre, categoría, precio, unidad, stock, peso variable
- Búsqueda/filtro por categoría o nombre
- **Crear producto** (modal o página):
  - Nombre display (UI) + nombre legal (recibo)
  - Precio (COP)
  - Unidad (kg / unidad / 500g / etc.)
  - Categoría (selector desde lista de categorías)
  - `is_variable_weight` (toggle)
  - `inStock` (toggle — "Disponible / Agotado")
  - Subir imagen: drag & drop o selector de archivo → subir a S3, guardar URL
  - Especificaciones de imagen: WebP, máximo 30KB, 400×400px — el sistema debe comprimir automáticamente o rechazar con mensaje claro
- **Editar producto** — mismos campos, precargar valores actuales
- **Toggle de stock** — disponible directamente desde la lista sin entrar al detalle (para marcado rápido de "Agotado" en el piso de la tienda)
- **Gestión de categorías** — CRUD simple: nombre + ícono SVG (upload)

**Endpoints que consume:**
- `GET /catalog/products?admin=true` (incluye productos agotados, no filtrados)
- `POST /catalog/products`
- `PATCH /catalog/products/:id`
- `PATCH /catalog/products/:id/stock`
- `GET /catalog/categories`
- `POST /catalog/categories`
- `PATCH /catalog/categories/:id`

**Endpoint de upload de imagen (nuevo):**
- `POST /catalog/products/:id/image` → genera presigned URL de S3 para upload directo desde el browser → retorna URL pública

---

## ADMIN-005: Toggle de Estado de la Tienda

**Tipo:** Frontend + Backend
**Prioridad:** Media
**Nota:** Actualmente el horario está hardcodeado en `client/src/config/app.ts`. Esta feature lo hace dinámico.

**Scope:**
- Sección en el Admin: "Estado de la tienda"
- Toggle principal: `Abierta / Cerrada` (override manual — útil para festivos o emergencias)
- Configuración de horario regular: día por día, hora de apertura y cierre
- El banner del cliente (`StoreStatusBanner`) lee de `GET /store/status` en lugar de la config estática
- Si el override manual está activo → ignora el horario calculado

**Endpoints:**
- `GET /store/status` (ya consumido por el cliente)
- `PATCH /store/status` → `{ override?: 'open' | 'closed' | null, schedule?: {...} }`

---

## Orden de Dependencias

```
── FASE DEMO (antes de Sprint 1) ────────────────────────────────
FEAT-DEMO-004 (Admin Demo)  → ejecutar junto al Sprint DEMO del cliente
                              usa mocks/localStorage, valida UX operativa
                              ← GO/NO-GO con el empleado de la tienda

── FASE REAL (Sprint 1+, requiere backend de FEAT-005+) ─────────
ADMIN-001 (Setup)         → base de todo; reutiliza componentes del demo
       ↓
ADMIN-002 (Lista)         → necesita backend Orders (FEAT-009+)
ADMIN-003 (Detalle)       → necesita ADMIN-002
ADMIN-004 (Catálogo)      → puede ir en paralelo con ADMIN-002/003
       ↓
ADMIN-005 (Estado tienda) → post F&F si el horario estático es suficiente
```

---

## Entregable para Día 15

Para el entregable del Día 15 del roadmap general, el Admin debe tener **ADMIN-001 + ADMIN-002 + ADMIN-003** operativos. El ADMIN-004 (catálogo) puede completarse hasta el Día 20 siempre que los productos reales se carguen via seed script inicial.

**Prerrequisito:** El Sprint DEMO debe estar aprobado (Go/No-Go) antes de iniciar ADMIN-001 de la fase real.

---

## Proceso Operativo Pre-Lanzamiento

Antes del F&F, ejecutar con el equipo de la tienda:
1. Cargar ~100 productos reales con fotos verificadas (ver `tareas/operaciones/carga-catalogo.md`)
2. Sesión de entrenamiento 2h (ver `tareas/operaciones/entrenamiento-admin.md`)
3. Simular 5 pedidos completos de prueba (cliente hace pedido → admin procesa → cliente recibe WhatsApp)
4. Confirmar que el número de WhatsApp del negocio recibe la alerta de nuevo pedido
