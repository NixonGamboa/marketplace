# MAUI — Análisis PM: MVP real para F&F en Dolores, Tolima

**Fecha:** 21 de abril de 2026
**Contexto:** Análisis de producto para definir qué construir, qué sobra y qué falta para un test real con Friends & Family (~30 usuarios) en Dolores, Tolima, Colombia. Aliado: "Leche y Miel" (supermercado local).

---

## El Loop Mínimo de Valor

El único flujo que importa para probar la idea:

> Doña Carmen abre el link de la PWA en su Samsung A13 con 3G de Movistar. La pantalla carga en menos de 4 segundos. Ve queso campesino y carne molida. Los agrega al carrito. Toca "Pedir mi Mercado". Ingresa su nombre y su ubicación (GPS o texto libre). Confirma. Recibe WhatsApp: *"Recibimos su pedido, Doña Carmen. En un rato le avisamos el valor exacto."* Treinta minutos después: *"Su mercado está listo. Total: $47.200. En camino."* El domiciliario llega. Paga en efectivo. El mercado está completo y correcto.

Ese loop requiere **seis piezas funcionales** y nada más:
1. La PWA carga rápido y no se rompe en 3G
2. El catálogo es navegable por pasillos con ~100 productos reales
3. El carrito persiste y se puede modificar
4. El checkout captura nombre, ubicación y preferencia de sustitución
5. El backend recibe el pedido y envía WhatsApp de confirmación
6. El admin de la tienda ve el pedido, lo procesa y el cliente recibe actualizaciones por WhatsApp

---

## Lo que SOBRA para F&F (MVP v1)

> Estas features pasan a **v2**. No se eliminan del producto — se posponen.

| Feature | Decisión | Versión |
|---------|----------|---------|
| Magic Link / JWT complejo (FEAT-007 como está diseñado) | **v2** — En F&F reemplazar por captura de nombre + teléfono en primer checkout | v2 |
| Página de Búsqueda (FEAT-003b) | **v2** — Con 100 productos los pasillos son suficientes | v2 |
| Product Detail Modal (FEAT-004) | **Coincidencia** — La tarjeta es suficiente hasta tener fotos de calidad | v2 |
| Time Slot Picker por hora | **A analizar** — Reemplazar por franja: "Mañana / Tarde / Lo antes posible" | v1 simplificado |
| WebSockets / SSE para order tracker | **v2** — Polling 30-60s es suficiente para el volumen de F&F | v2 |
| Módulo Financiero / Wallet / comisiones (AcuerdosOperativos §1C) | **v3+** — Documentar la arquitectura completa; no construir hasta 3+ aliados | v3+ |
| Fotos en S3 con presigned URLs (FEAT-012 infraestructura) | **v2** — En F&F la foto llega por WhatsApp directo desde el Admin | v2 |
| Sistema de Devoluciones formal | **v2** — En F&F se resuelve por WhatsApp directamente | v2 |
| Plan B manual para fallas de backend | **No aplica F&F** — La disponibilidad de AWS es suficiente para cubrir este riesgo | eliminado |

---

## Lo que FALTA y es CRÍTICO

### 🚨 BRECHA 1 — MAUI Admin no existe en ningún sprint (BLOQUEADOR TOTAL)

El roadmap tiene 12 features para el cliente PWA. Tiene **cero** para la tienda.

Sin Admin, "Leche y Miel" no puede:
- Ver que llegó un pedido (la alerta llega por WhatsApp al número del negocio — suficiente para F&F)
- Saber qué productos pidieron
- Cambiar el estado del pedido
- Ingresar el peso real de la carne/verduras
- Enviar la foto del mercado empacado por WhatsApp
- Marcar un producto como agotado

**El loop no cierra.** El cliente hace el pedido y no pasa nada del otro lado.

**Admin mínimo para F&F (proyecto aparte — ver roadmap-admin.md):**
- Lista de pedidos con polling simple
- WhatsApp al número del negocio cuando llega pedido nuevo
- Vista detalle: cliente, items, cantidades, dirección, preferencia de sustitución
- Botones grandes de cambio de estado
- Input de peso real para productos variables (recalcula total automáticamente)
- Botón "Notificar cliente" con mensaje de WhatsApp prellenado
- Toggle de producto agotado
- Auth: usuario/contraseña hardcodeada para F&F
- Gestión de catálogo: **crear, editar y desactivar productos + subir imágenes desde el sistema** (esto desacopla la carga del catálogo del proceso de desarrollo)

### 🚨 BRECHA 2 — Catálogo real de "Leche y Miel"

El seed script técnico existe pero **el proceso operativo no está en el plan**: fotografiar ~100 productos reales, subir imágenes en WebP <30KB, ingresar nombres y precios idénticos al local físico, marcar cuáles son de peso variable.

**Solución:** El Admin debe permitir crear y editar productos con imágenes directamente desde la interfaz. El equipo de "Leche y Miel" carga el catálogo real desde el panel, sin depender de un deploy de código. Esto también permite mantener el catálogo actualizado de forma autónoma.

### 🚨 BRECHA 3 — Sin entrenamiento del empleado de la tienda

Antes del lanzamiento F&F: sesión de 2 horas de práctica, simular 5 pedidos completos con el equipo de la tienda. Esto se planifica como actividad operativa, no técnica.

---

## Ajustes Culturales Aceptados

| Punto | Decisión final |
|-------|----------------|
| GPS para dirección | **Mantener GPS** — es fiable en Dolores para indicaciones vagas. Combinar con campo de texto libre para referencias adicionales ("frente a la cancha"). GPS como apoyo, no como sustituto del texto. |
| Time Slots | Simplificar a franjas: "Mañana (7am-12pm) / Tarde (12pm-6pm) / Lo antes posible" — a definir en spec |
| Copy del CTA | Corregir en código: `CartPage.tsx` usa "Confirmar pedido" — debe ser **"Pedir mi Mercado"** |
| Sustitución | Copy simplificado: "Que me manden algo parecido" en lugar de "Cambiar por similar (Marca/Precio)" |
| PWA theme_color | Corregir en `vite.config.ts`: `'#7441d8'` → `'#2F7D32'` |
| Foto del pedido | Es el momento de mayor confianza — **no puede ser post-MVP**. Para F&F: el admin envía la foto por WhatsApp desde el panel. |

---

## MVP Redefinido para F&F (v1)

### ENTRA AL MVP v1

**Cliente PWA:**
- Home: StoreStatusBanner + carrusel destacados + PasillosGrid
- `/catalog/:categoryId` — Catálogo por pasillo con badge de peso variable (FEAT-003)
- Carrito con persistencia localStorage ✅ ya implementado
- Checkout: nombre + ubicación (GPS + campo texto libre de referencia) + franja horaria simplificada + preferencia de sustitución + **"Pedir mi Mercado"**
- Pantalla de confirmación de pedido
- Notificación de WhatsApp al cliente al confirmar y en cada cambio de estado
- Auth v1: captura de nombre + teléfono en el primer checkout (sin Magic Link complejo)

**MAUI Admin v1 (proyecto aparte — roadmap-admin.md):**
- Lista de pedidos con polling + WhatsApp al negocio en pedido nuevo
- Detalle del pedido + cambio de estado + input de peso + botón WhatsApp prellenado
- Toggle de agotado
- **CRUD de catálogo con carga de imágenes** (productos reales sin tocar código)
- Auth hardcodeada

**Backend:**
- `GET /catalog/products`, `GET /catalog/categories`
- `POST /orders` → genera ID, envía WhatsApp a cliente y al negocio
- `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/status`
- `PATCH /orders/:id/weights` (ajuste de pesos, recalcula total)
- `PATCH /products/:id` (CRUD de producto + toggle stock)
- WhatsApp Gateway (Evolution API, número SIM dedicado)

**Catálogo:**
- ~100 productos reales de Leche y Miel cargados desde el Admin antes del lanzamiento
- Precios verificados y paridad exacta con el local físico

### SALE DEL MVP v1 (→ v2)

- Auth Magic Link / JWT complejo
- Página de búsqueda
- Product Detail Modal
- Order tracker en PWA con polling visual
- Fotos en S3 con presigned URLs
- WebSockets
- Módulo financiero / Wallet (→ v3+)
- Sistema de devoluciones formal

---

## Roadmap de Construcción Revisado

### Días 0-15 — Infraestructura + Admin (el lado invisible)

> **Objetivo:** La tienda puede ver y procesar pedidos aunque la PWA no esté terminada.

1. **WhatsApp Gateway** — Evolution API en VPS, número SIM nuevo y dedicado, warming 2 semanas antes del F&F. **Mayor riesgo técnico — resolver primero.**
2. **FEAT-005:** AWS SAM setup — DynamoDB, API Gateway, Lambda, tablas Orders/Products/Categories
3. **MAUI Admin v1:** endpoints CRUD + UI (lista pedidos, detalle, cambio de estado, ajuste pesos, CRUD catálogo con imágenes, WhatsApp al negocio)
4. **Carga del catálogo real:** el equipo de "Leche y Miel" ingresa ~100 productos desde el Admin (fotos, precios, nombres, peso variable)

**Entregable Día 15:** El empleado puede ver pedidos de prueba, cambiar estados, y el cliente recibe WhatsApp. Loop back-end cerrado.

### Días 16-30 — PWA cliente — loop completo

> **Objetivo:** El cliente puede completar el primer pedido real de punta a punta.

5. **FEAT-006:** Conectar PWA a Catalog API real (reemplazar mocks)
6. **FEAT-003:** CatalogPage `/catalog/:categoryId`
7. **Auth v1:** captura de nombre + teléfono en primer checkout
8. **FEAT-008 + FEAT-009:** Checkout simplificado → `POST /orders` → pantalla de confirmación
9. **Correcciones de desalineación:** copy "Pedir mi Mercado" en CartPage, `theme_color` en vite.config, datos Colombia en app.ts
10. **Prueba end-to-end:** 5 pedidos reales con el equipo y el aliado

**Entregable Día 30:** PWA deployable para F&F. Se invita a los primeros 10 F&F.

### Días 31-60 — Estabilización y confianza

11. Monitoreo de errores (Sentry) — no opcional
12. Magic Link completo (FEAT-007) — ahora que el Gateway ya está operando
13. Ajustes de UX basados en feedback real de los F&F
14. Order tracker en PWA con polling — **solo si el feedback indica que alguien lo usa** (el WhatsApp puede ser suficiente)

**Entregable Día 60:** 50 pedidos procesados, fricciones medidas, Magic Link funcionando.

### Días 61-90 — Madurez para escalar

15. Order tracker con foto desde S3 (FEAT-012 completo)
16. Performance audit: Lighthouse score en 3G simulado
17. Búsqueda si el catálogo supera 60 productos activos
18. "Mis Pedidos Anteriores" (FEAT-011)
19. Documentación del Admin para onboarding de segundo aliado

---

## Riesgos Críticos de Producción

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|--------|-------|---------|------------|
| 1 | **WhatsApp Gateway baneado** | Alta | Catastrófico | Número SIM nuevo dedicado, warming 2 semanas, rate limits conservadores, número de respaldo listo |
| 2 | **Admin inoperable bajo presión** — el empleado ignora pedidos digitales cuando hay clientes físicos | Alta | Alto | 2h de entrenamiento antes del lanzamiento, simular 5 pedidos en "rush", UI ultra-simple, WhatsApp como alerta principal |
| 3 | **Submit duplicado por 3G inestable** — usuario toca "Pedir" dos veces | Media | Alto | Botón disabled + loading state post-submit, idempotency key en `POST /orders`, timeout 20s |
| 4 | **Precios desalineados con el local físico** | Media | Alto | Auditoría precio a precio antes del launch, paridad exacta como requisito innegociable del aliado |
| 5 | **Cobro inesperado por peso variable** — cliente esperaba $18.000 y se cobra $22.320 | Alta | Medio | WhatsApp de "Listo" incluye desglose por producto, no solo el total; el admin no puede avanzar a "En Camino" sin ingresar pesos reales |

---

## Documentos Creados

| Archivo | Descripción | Estado |
|---------|-------------|--------|
| `tareas/roadmap-admin.md` | Roadmap independiente para MAUI Admin (proyecto aparte) | ✅ Creado |
| `tareas/roadmap-v2.md` | Features pospuestas de MVP: Magic Link, Búsqueda, Order Tracker PWA, S3 fotos | ✅ Creado |
| `tareas/roadmap-v3.md` | Features post-escala: Módulo financiero, Wallet, WebSockets, Multi-aliado | ✅ Creado |
| `tareas/operaciones/carga-catalogo.md` | Proceso operativo de fotografiar y cargar ~100 productos reales desde el Admin | ✅ Creado |
| `tareas/operaciones/entrenamiento-admin.md` | Guía de onboarding del empleado de la tienda | ✅ Creado |

---

## Conclusión Ejecutiva

El roadmap actual construye una excelente PWA de cliente y olvida que hay un vendedor del otro lado. El cambio más importante: **el primer mes es mitad infraestructura compartida y mitad Admin de la tienda.** La PWA del cliente puede esperar hasta el día 30. La tienda no puede esperar ni un día.

La segunda decisión crítica: **el CRUD del catálogo debe vivir en el Admin**, no en scripts de seed técnicos. El equipo de "Leche y Miel" debe poder agregar, editar y desactivar sus ~100 productos de forma autónoma. Esto desacopla el contenido del desarrollo.

**El loop mínimo de valor existe, es simple, y está al alcance en 30 días si se construye en el orden correcto.**

---

## Validación del Codebase — 21 de abril de 2026

> Auditoría del estado real del código para contrastar supuestos del análisis.

### Lo que existe vs. lo que el análisis asumía

| Feature | Este análisis decía | Estado real validado |
|---|---|---|
| Cart con persistencia | ✅ Implementado | ✅ CONFIRMADO — `stores/cartStore.ts` + `localStorage` key `maui-cart` |
| Home page | ✅ Implementado | ✅ CONFIRMADO — carousel + PasillosGrid + StoreStatusBanner funcionales |
| `/catalog/:categoryId` (FEAT-003) | Días 16-30 | ❌ CONFIRMADO pendiente — ruta referenciada en `PasillosGrid`, sin page component |
| Checkout page | Días 16-30 | ❌ CONFIRMADO pendiente — `/checkout` en `CartPage.tsx` sin page en `App.tsx` |
| AuthPage | v2 | ⚠️ Solo UI stub — botón sin flujo real |
| Orders page | Días 31-60 | ⚠️ Placeholder "Próximamente" — no funcional |
| Product Detail Modal | v2 | ❌ No iniciado |
| Backend API (`/server/`) | Días 0-15 | ❌ CONFIRMADO — folder `/server/` NO EXISTE |
| Admin panel (`/admin/`) | Días 0-15 | ❌ CONFIRMADO — no existe ningún workspace de Admin |

**Conclusión:** La documentación estratégica está completa. El codebase tiene la base del cliente PWA (Home, Cart, componentes) pero le faltan las tres piezas de cierre del loop: Catalog page, Checkout y el lado del negocio (Admin + Backend).

### Componentes construidos y listos para conectar a API real

- `ProductCard` con badge `is_variable_weight` y lógica de `inStock`
- `PasillosGrid` con navegación por categorías
- `StoreStatusBanner` (actualmente lee config estática — preparado para API override)
- `FloatingCartBar` (aparece cuando `cartCount ≥ 1`)
- `CartItemRow` con controles `[-] [+]` y remove
- `Carousel` accesible con autoplay, indicadores y navegación por teclado
- `Button`, `Input`, `Icon` — librería base completa
- `cartStore` (Zustand + persist) — listo para producción
- `useCatalog` hooks (React Query) — listos para reemplazar mocks por API real
- Modelos de datos `Product`, `Order`, `CartItem` — alineados con spec de backend

### Time Slot Picker — decisión confirmada

El picker de hora por hora del backlog **no ha sido construido**. Esto es una ventaja: empezar directamente con la versión simplificada de 3 franjas ("Mañana / Tarde / Lo antes posible"), evitando deuda técnica.

### Correcciones de código pendientes (bugs de desalineación)

Verificados directamente en el código:

| Archivo | Bug | Corrección |
|---|---|---|
| `client/src/features/cart/pages/CartPage.tsx` | CTA dice "Confirmar pedido" | → "Pedir mi Mercado" |
| `client/vite.config.ts` | `theme_color: '#7441d8'` (morado) | → `'#2F7D32'` (verde MAUI) |
| `client/src/config/app.ts` | `SUPPORT_PHONE` y `WHATSAPP_LINK` son placeholders genéricos | → Número real de Leche y Miel |

Estas tres correcciones son de 5 minutos cada una y deben hacerse antes de cualquier demo o deploy.
