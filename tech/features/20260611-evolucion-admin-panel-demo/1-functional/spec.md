# Functional Specification — evolucion-admin-panel-demo

**Feature**: Evolución del panel admin de MAUI para cerrar el loop de la demo de validación con usuarios reales en Dolores, Tolima.

**Idioma**: Español (es)
**Tipo**: MVP — demo sin backend real
**Fecha**: 2026-06-11

---

## 1. Resumen Ejecutivo

La PWA admin (`maui-admin-front`) tiene hoy una versión mínima: lista de pedidos, detalle con avance de estado y link de WhatsApp. Para que la **Fase 2** del RFC `demo-maui-pwa-rfc.md` (validación con 5 usuarios reales + walkthrough con el aliado) sea ejecutable, el panel debe convertirse en una herramienta que el empleado de Leche y Miel pueda operar **sin entrenamiento**, mostrando nombres reales de productos, capturando pesos reales, alertando pedidos nuevos y dejando al aliado dueño de su catálogo y horario.

Esta feature evoluciona el panel completando el `roadmap-admin.md` y los huecos detectados en `docs/rq-PO-admin-panel-fase0.md`. Todo se implementa con **mock repositories** en localStorage cuyas firmas son idénticas a las que consumirá el backend real en Sprint 1 — el swap es un cambio de import.

---

## 2. Objetivos

| # | Objetivo |
|---|----------|
| **OBJ-1** | Cerrar el loop operativo de la demo: cliente hace pedido → admin lo ve, lo procesa con pesos reales y avanza estado → notifica por WhatsApp |
| **OBJ-2** | Permitir al empleado de Leche y Miel operar el panel sin entrenamiento extenso (CU-6 del RFC) |
| **OBJ-3** | Independizar al aliado: poder editar catálogo y horarios sin tocar código |
| **OBJ-4** | Dejar la capa de servicios mock con contratos idénticos al backend real para que el swap sea quirúrgico en Sprint 1 |
| **OBJ-5** | Introducir autenticación y roles mock que permitan demostrar la capa de seguridad sin construir infraestructura real |

---

## 3. Métricas de Éxito

| Métrica | Meta | Cómo se mide |
|---------|------|--------------|
| El empleado procesa 3 pedidos de prueba sin ayuda | ✅ | Walkthrough Fase 2 |
| Tiempo desde pedido recibido → estado avanzado | < 60s | Cronometrado en walkthrough |
| El admin muestra nombre legible de cada producto | 100% items | Inspección visual |
| Pesos reales capturados antes de "listo" | 100% items variables | Validación en UI |
| El aliado puede modificar precio sin desarrollador | ✅ | Test de aceptación con dueño L&M |
| Cambio de horario refleja en el banner admin | < 30s | Test de aceptación |
| Contratos de mock repositories alineados con tipos del PWA | 100% | TypeScript build sin errores cruzados |

---

## 4. Personas y Roles

| Persona | Rol | Responsabilidades |
|---------|-----|-------------------|
| **Dueño Leche y Miel** | `owner` | Gestiona catálogo, horarios, configuración del aliado, ve auditoría |
| **Empleado de tienda** | `operator` | Procesa pedidos, captura pesos, avanza estado, contacta cliente |

> Para la demo se siembran 2 usuarios mock: `owner@lechemiel.demo` y `operator@lechemiel.demo`. Credenciales vía `VITE_ADMIN_USERS` (JSON pre-cargado) o defaults en código.
> Nota: el rol `viewer` mencionado por el PO se descarta del scope — no se implementa ni se siembra usuario para entrenamiento.

---

## 5. Casos de Uso

| # | Caso de Uso | Actor | Descripción |
|---|-------------|-------|-------------|
| **CU-1** | Login y selección de rol | Ambos | Ingresa credenciales, queda en sesión 8h, ve la pantalla acorde a su rol |
| **CU-2** | Ver pedidos del día agrupados por estado | operator | Tabs por estado, pedidos `received` parpadean + suenan |
| **CU-3** | Procesar pedido con pesos reales | operator | Captura kg reales de ítems variables, ve recálculo en vivo, bloquea avance si faltan |
| **CU-4** | Cancelar pedido con motivo | operator | Marca cancelado con motivo obligatorio, dispara WhatsApp explicativo |
| **CU-5** | Notificar por WhatsApp en cada transición | operator | Link prellenado con mensaje según estado |
| **CU-6** | Dashboard del día | Ambos | Pedidos por estado, ticket promedio, alertas de demora |
| **CU-7** | Buscar pedido por nombre/teléfono/fecha | operator | Filtro instantáneo sobre la lista |
| **CU-8** | Imprimir/copiar picking list | operator | Genera lista plana con cantidades y pesos para llevar al piso |
| **CU-9** | Histórico por rango de fechas | Ambos | Consulta pedidos pasados (últimos 90 días) |
| **CU-10** | Gestionar catálogo | owner | Crea/edita productos (sin imagen real, URL placeholder), edita precio, toggle stock rápido |
| **CU-11** | Gestionar categorías | owner | CRUD simple de categorías (nombre + ícono placeholder) |
| **CU-12** | Toggle estado de tienda + horario | owner | Override abierto/cerrado y configuración semanal |
| **CU-13** | Configurar datos del aliado | owner | Edita WhatsApp del negocio, dirección, nombre comercial |
| **CU-14** | Ver auditoría | owner | Lista de eventos: quién cambió qué pedido, cuándo |
| **CU-15** | Cerrar sesión | Ambos | Limpia sessionStorage y vuelve a login |

---

## 6. Historias de Usuario

### US-1 — Login con rol
**Como** empleado de Leche y Miel
**Quiero** ingresar con usuario y contraseña
**Para** que el panel solo cargue las acciones a las que tengo permiso

**Criterios de aceptación**:
- Existe pantalla `/login` con campos usuario, contraseña y botón "Ingresar"
- Credenciales válidas crean sesión en `sessionStorage` con `{userId, role, merchantId, expiresAt}` (expira 8h)
- Credenciales inválidas muestran error "Usuario o contraseña incorrectos" sin revelar cuál falló
- Rutas sin sesión válida redirigen a `/login`
- Rutas que requieren rol específico redirigen al dashboard con mensaje si el rol no coincide
- Botón "Cerrar sesión" en el header limpia la sesión y vuelve a `/login`

### US-2 — Tabs por estado + alerta sonora
**Como** operator
**Quiero** ver pedidos agrupados por estado con alerta llamativa cuando llega uno nuevo
**Para** no perder pedidos mientras atiendo clientes físicos en la tienda

**Criterios de aceptación**:
- La lista de pedidos muestra tabs: `Todos | Nuevos | En proceso | Entregados | Cancelados`
- Cada tab muestra el conteo entre paréntesis
- Pedidos en estado `received` creados en los últimos 5 min: fila con fondo ámbar + badge "Nuevo"
- Cuando llega un pedido `received` nuevo (polling): se reproduce un sonido corto (Web Audio API) **una sola vez por pedido**
- La alerta sonora respeta una "preferencia de silencio" en sessionStorage (toggle visible)
- Polling de la lista cada 5s (configurable vía constante)

### US-3 — Mostrar nombre real del producto
**Como** operator
**Quiero** ver el nombre legible del producto (no el SKU)
**Para** poder buscarlo físicamente en la tienda sin descifrar códigos

**Criterios de aceptación**:
- El detalle del pedido muestra `name_display` y `unit` para cada ítem, no el `id`
- Si el catálogo no resuelve el SKU, se muestra `name_display: "[SKU desconocido]"` con tooltip explicativo
- La imagen del producto (URL placeholder) se muestra en miniatura al lado del nombre
- La picking list también usa nombre real

### US-4 — Captura de pesos reales
**Como** operator
**Quiero** capturar el peso real de los productos vendidos por peso
**Para** que el cobro final refleje exactamente lo que el cliente recibe

**Criterios de aceptación**:
- Si el pedido contiene ítems con `is_variable_weight: true`, cada uno muestra un input numérico "Peso real (kg)" con paso 0.01
- El cliente pidió en kg (snapshot `kilos` en el `CartItem`); el campo precarga ese valor como sugerencia editable
- Al editar el peso real, recalcula subtotal del ítem y total del pedido en vivo
- El botón "Marcar como listo" queda deshabilitado si **cualquier ítem variable** no tiene `realWeightKg` registrado
- El total recalculado se persiste como `finalTotal` separado de `estimatedTotal`

### US-5 — Cancelar pedido con motivo
**Como** operator
**Quiero** cancelar un pedido cuando no se puede cumplir
**Para** liberar al cliente y dejar trazabilidad del motivo

**Criterios de aceptación**:
- Botón "Cancelar pedido" visible mientras el estado no sea `delivered` ni `cancelled`
- Al pulsar: abre modal con textarea "Motivo de cancelación" (obligatorio, mínimo 10 caracteres)
- Confirmación cambia estado a `cancelled`, persiste el motivo en el order
- Genera link WhatsApp prellenado con: "Hola [nombre], lamentamos no poder procesar su pedido: [motivo]. Comuníquese al [whatsapp aliado]."

### US-6 — Dashboard del día
**Como** Ambos roles
**Quiero** ver el estado del día en una sola pantalla al entrar
**Para** saber dónde poner el foco sin abrir cada pedido

**Criterios de aceptación**:
- Ruta `/` muestra: KPIs (pedidos totales hoy, pedidos por estado, ticket promedio, # cancelados)
- Sección "Alertas activas": pedidos en estado `received` con > 5 min sin avanzar
- Sección "Últimos 5 pedidos" con link al detalle
- Refresca cada 10s

### US-7 — Búsqueda y filtros
**Como** operator
**Quiero** buscar un pedido por nombre, teléfono o fecha
**Para** atender consultas de clientes que llaman preguntando por su pedido

**Criterios de aceptación**:
- Barra de búsqueda sobre la lista de pedidos
- Búsqueda instantánea (debounced 200ms) sobre `customerName`, `customerPhone`, `orderId`
- Filtro por rango de fechas con presets: Hoy / Ayer / Últimos 7 días / Últimos 30 días / Personalizado
- Resultados muestran el mismo formato de fila que la lista normal
- "Limpiar filtros" vuelve al estado por defecto (todos los de hoy)

### US-8 — Picking list imprimible
**Como** operator
**Quiero** sacar una lista plana del pedido para llevar al piso de la tienda
**Para** preparar el pedido sin tener la tablet en la mano

**Criterios de aceptación**:
- Botón "Picking list" en el detalle del pedido
- Genera vista plana: encabezado (cliente, modalidad, hora) + tabla de ítems (nombre, cantidad/kg, ubicación si aplica)
- Acciones: "Imprimir" (abre diálogo nativo del browser) y "Copiar al portapapeles" (texto plano formateado)
- Estilos `@media print` ocultan menús y dejan solo la lista

### US-9 — Histórico por rango
**Como** Ambos roles
**Quiero** consultar pedidos pasados
**Para** auditar el negocio y resolver disputas

**Criterios de aceptación**:
- Ruta `/historico` con date-range picker (default: últimos 30 días)
- Muestra mismo layout de lista que pedidos del día
- Soporta los mismos filtros de búsqueda
- Profundidad máxima: 90 días desde hoy (más allá: mensaje "El histórico de demo va 90 días atrás")

### US-10 — CRUD de catálogo
**Como** owner
**Quiero** crear, editar y desactivar productos sin pedirle ayuda al equipo técnico
**Para** mantener el catálogo actualizado con stock real

**Criterios de aceptación**:
- Ruta `/catalogo` (solo owner): tabla de productos con columnas nombre, categoría, precio, unidad, stock, peso variable, acciones
- Toggle "Disponible/Agotado" directo en la fila (sin entrar al detalle)
- Acción "Editar precio" inline (input + guardar) sin abrir formulario completo
- Botón "Nuevo producto" abre formulario con: nombre display, nombre legal, precio, unidad, categoría, `is_variable_weight`, `inStock`, URL de imagen (campo de texto, placeholder por defecto)
- Acción "Editar" en cada fila precarga los valores
- Acción "Eliminar" pide confirmación; en lugar de borrar, marca `archived: true` (no aparece en listados pero se preserva el histórico de pedidos que lo referencian)

### US-11 — CRUD de categorías
**Como** owner
**Quiero** gestionar las categorías (pasillos) del catálogo
**Para** organizar los productos como en la tienda física

**Criterios de aceptación**:
- Sub-sección dentro de `/catalogo`: lista de categorías con nombre, slug, # productos, orden
- Crear/editar categoría: nombre, slug (auto-generado), orden, icono (URL placeholder o emoji)
- No se puede eliminar una categoría con productos asignados (error claro)
- Reordenar via drag-and-drop (o input numérico de orden, MVP-simple)

### US-12 — Toggle de tienda + horario
**Como** owner
**Quiero** marcar la tienda como cerrada manualmente y configurar el horario semanal
**Para** evitar pedidos en festivos o emergencias

**Criterios de aceptación**:
- Ruta `/tienda` (solo owner): toggle principal "Abierta / Cerrada (override manual)"
- Form de horario regular: para cada día (lun–dom): hora apertura, hora cierre, checkbox "cerrado todo el día"
- Si override = cerrada → muestra siempre "Cerrada" sin importar el horario
- Cambios se persisten en localStorage; el dashboard refleja el estado en < 30s

### US-13 — Configuración del aliado
**Como** owner
**Quiero** editar los datos del aliado (WhatsApp, dirección, nombre comercial)
**Para** mantener al día la información que el cliente ve

**Criterios de aceptación**:
- Ruta `/configuracion` (solo owner): form con campos WhatsApp (con validador de formato CO `+57...`), dirección, nombre comercial, slogan corto
- Guardar persiste en localStorage del admin (namespace `maui-admin-merchant`)
- Estos datos los consumen los links de WhatsApp generados desde el detalle del pedido
- **Nota explícita**: estos cambios NO se reflejan en el PWA de clientes durante esta iteración (decisión PO)

### US-14 — Auditoría visible
**Como** owner
**Quiero** ver una lista de quién hizo qué en el panel
**Para** entender la actividad operativa y resolver dudas

**Criterios de aceptación**:
- Ruta `/auditoria` (solo owner): tabla con timestamp, usuario, acción, recurso (ej. orderId)
- Acciones cubiertas: login, logout, cambio de estado de pedido, cancelación, edición de catálogo, toggle de tienda, edición de aliado
- Cada cambio de estado en pedido escribe entrada de auditoría automáticamente
- Filtro por usuario, por tipo de acción y por rango de fechas
- Retención: últimas 500 entradas en localStorage (rotación FIFO)

### US-15 — Seed propio del admin
**Como** dueño de producto
**Quiero** que el admin tenga datos de demostración listos al abrirse en cualquier dispositivo
**Para** poder hacer demos sin depender de que el PWA haya corrido antes en ese navegador

**Criterios de aceptación**:
- Al cargar la app por primera vez (marker `maui-admin-seeded-v1` ausente): se siembran usuarios mock, catálogo (15 productos en 4 categorías), configuración aliado, horarios default, y **3 pedidos demo** (en estados received / preparing / delivered) — diferentes a los del PWA para no duplicar
- El seed es idempotente: ejecutar la app de nuevo no duplica datos
- Existe acción oculta (atajo o botón en `/configuracion`) "Reiniciar demo" que borra todo y vuelve a sembrar

---

## 7. Alcance

### 7.1 In Scope

- Todas las US-1 a US-15 listadas arriba
- Capa de mock repositories en `services/`: `mockOrderRepository`, `mockCatalogRepository`, `mockStoreStatusRepository`, `mockAuthRepository`, `mockAuditRepository`, `mockMerchantRepository`
- Cada repository: delays 300–800ms, namespace `maui-admin-*` en localStorage, seed idempotente
- Contratos de tipos compartidos con el PWA (replicados con check de consistencia)
- Auth mock con sessionStorage, expiración 8h, 2 roles (owner, operator)
- Audit log mock visible vía UI
- merchantId placeholder en sesión (hardcoded `leche-y-miel` por ahora pero el contrato lo expone)

### 7.2 Out of Scope

| Item | Razón |
|------|-------|
| Backend real (API, DB, auth real) | Esta es la demo; el swap llega en Sprint 1 |
| Subida de imágenes real (S3, compresión) | Demo usa URLs placeholder; subida es complejidad innecesaria |
| Sincronización catálogo admin ↔ PWA | Decisión PO: cada app mantiene su catálogo en la demo |
| Sincronización config aliado admin ↔ PWA | Decisión PO US-13 |
| Web Push notifications | Decisión PO: alerta sonora + badge cubren el caso |
| Viewer role (solo-lectura) | Solo 2 roles para esta iteración (decisión PO) |
| Multi-merchant real (más de un aliado) | Hardcoded `leche-y-miel`; placeholder reservado en sesión |
| OAuth/SSO | Auth mock es suficiente para la demo |
| Tests E2E | MVP solo cubre tests unitarios e integración en flujos críticos |
| Recuperación de contraseña | No aplica con credenciales hardcoded |

---

## 8. Modelo de Dominio

> Replica/extiende el modelo del PWA (`MAUI-PWA-customers/src/types/orderService.ts` + `types/catalog.ts`).

| Entidad | Campos clave | Notas |
|---------|--------------|-------|
| `AdminUser` | `id, email, role: 'owner'\|'operator', merchantId, displayName` | Sembrado en mock |
| `Session` | `userId, role, merchantId, issuedAt, expiresAt` | sessionStorage `maui-admin-session` |
| `Order` | (espejo PWA) + `realWeights?: Record<itemId, kg>`, `finalTotal?`, `cancellationReason?`, `assignedTo?: userId` | userId del cliente preservado |
| `CartItem` | `id, qty, priceAtMoment, kilos?` | Se enriquece en UI cruzando con Product |
| `Product` | (espejo PWA) + `archived?: boolean` | Catálogo del admin |
| `Category` | `id, name, slug, order, iconUrl?` | Independiente |
| `StoreStatus` | `override?: 'open'\|'closed'\|null, schedule: WeeklySchedule` | localStorage `maui-admin-store` |
| `WeeklySchedule` | `{[day: 'mon'..'sun']: {open, close, closed: boolean}}` | |
| `Merchant` | `merchantId, commercialName, whatsapp, address, slogan?` | localStorage `maui-admin-merchant` |
| `AuditEvent` | `id, at, userId, userDisplay, action, resourceType, resourceId, payload?` | Últimas 500 |

---

## 9. Reglas de Negocio

| # | Regla |
|---|-------|
| **RN-1** | Una sesión expirada bloquea acciones y fuerza re-login |
| **RN-2** | El operator no puede acceder a `/catalogo`, `/tienda`, `/configuracion`, `/auditoria` |
| **RN-3** | El owner tiene acceso a todo lo del operator + las rutas exclusivas |
| **RN-4** | No se puede avanzar un pedido a `ready` si tiene ítems variables sin `realWeightKg` |
| **RN-5** | `finalTotal` se calcula como Σ(qty × precio × (realWeightKg ?? 1)). Si ningún ítem variable, `finalTotal = estimatedTotal` |
| **RN-6** | Una cancelación es terminal: no se puede revertir |
| **RN-7** | Una categoría con productos asignados no se puede eliminar; mensaje claro |
| **RN-8** | Un producto eliminado se archiva (`archived: true`), no se borra duro, para preservar referencias en pedidos pasados |
| **RN-9** | Toda mutación con efecto (cambio estado, edición catálogo, cancelación, cambios de tienda/aliado) genera entry de auditoría |
| **RN-10** | El audit log retiene las últimas 500 entradas (FIFO) |
| **RN-11** | El polling de pedidos respeta la pestaña activa (visibilitychange API): se pausa cuando la pestaña está oculta y se reanuda al volver |
| **RN-12** | Alerta sonora se reproduce **una vez por orderId** (set de IDs ya notificados en sessionStorage) |
| **RN-13** | Histórico nunca consulta más allá de 90 días |
| **RN-14** | La sesión guarda `merchantId` aunque hoy solo exista `leche-y-miel` — todos los reads/writes a repositories pasan el merchantId |

---

## 10. Dependencias

| Tipo | Dependencia | Notas |
|------|-------------|-------|
| Datos | localStorage del browser | Único almacén en la demo |
| Datos | Tipos compartidos del PWA | `Order`, `Product`, `Category`, `CartItem`, `OrderStatus` etc — replicados con check de drift |
| API externa | WhatsApp Web (`wa.me`) | Links prellenados, sin SDK |
| API browser | Web Audio API | Para alerta sonora |
| API browser | `window.print()` + `@media print` | Para picking list |
| API browser | `navigator.clipboard` | Para "copiar picking list" |
| API browser | Page Visibility API | Para pausar polling con pestaña oculta |
| Lib | React 19 + Vite + React Router DOM 7 + Tailwind + lucide-react | Ya en `package.json` admin |

---

## 11. Riesgos

| # | Riesgo | Mitigación |
|---|--------|------------|
| **R-1** | Drift entre tipos del admin y del PWA al cambiar el PWA | Tipos compartidos vía replicación con script de check (al menos verificación manual al iniciar la feature) |
| **R-2** | Demo con localStorage no funciona en modo incógnito o entre tablets | Documentar limitación; la demo se ejecuta en navegador normal y en un solo dispositivo por sesión |
| **R-3** | Sonido bloqueado por política del browser (necesita gesto de usuario) | Pedir un primer click "Habilitar sonido" al cargar el panel; documentar en walkthrough |
| **R-4** | Empleado se confunde con la captura de pesos | Precarga el `kilos` solicitado por el cliente como sugerencia; texto guía claro |
| **R-5** | El audit log crece sin control | Rotación FIFO 500 entradas (RN-10) |
| **R-6** | El admin guarda contraseñas en plano en env vars | Aceptado para demo: documentar en RFC que producción usa Cognito + JWT |
| **R-7** | El swap del mock al backend real arrastra divergencias del contrato | Contratos definidos como `interface` TypeScript explícita por repository; los mocks implementan esa interface |

---

## 12. Escenarios de Calidad

| # | Escenario | US |
|---|-----------|----|
| **SC-1** | Operator intenta entrar a `/catalogo` → redirige a dashboard con toast "Sin permiso" | US-1 |
| **SC-2** | Llegan 3 pedidos nuevos seguidos → suena 3 veces (una por pedido), no más al refrescar | US-2 |
| **SC-3** | Detalle de pedido con item de queso campesino → muestra input de peso real con kg pedidos precargados | US-4 |
| **SC-4** | Operator intenta "Marcar como listo" sin pesos → botón disabled + tooltip explicativo | US-4 |
| **SC-5** | Cancelación con motivo "se acabó el queso" → estado cancelado + link WhatsApp con motivo en el mensaje | US-5 |
| **SC-6** | Search "Juan" → muestra solo pedidos de clientes que matchean | US-7 |
| **SC-7** | Imprimir picking list → al imprimir, solo aparece la tabla del pedido sin chrome del navegador | US-8 |
| **SC-8** | Owner edita precio inline → cambio persiste y queda en audit log | US-10 |
| **SC-9** | Toggle "Cerrada (override)" → dashboard refleja "Cerrada" en < 30s | US-12 |
| **SC-10** | Primer arranque en navegador limpio → seed siembra usuarios + catálogo + 3 pedidos demo | US-15 |
| **SC-11** | Segundo arranque en mismo navegador → no duplica datos | US-15 |
| **SC-12** | Click "Reiniciar demo" en `/configuracion` → todo vuelve al estado inicial sembrado | US-15 |
| **SC-13** | Sesión expirada (forzado +8h) → cualquier ruta redirige a `/login` | US-1 |
| **SC-14** | Pestaña en background → polling se pausa; al volver → se reanuda inmediatamente | RN-11 |

---

## 13. Notas para Fase 2 (validación con usuarios)

- El walkthrough con el dueño de Leche y Miel cubre las US del rol `owner` (catálogo, horarios, configuración).
- Las 3 sesiones de procesamiento de pedidos de prueba cubren el rol `operator` (CU-2 a CU-8).
- Punto explícito a observar: si el operator entiende la captura de pesos a la primera (US-4 es el más nuevo conceptualmente).
- Los hallazgos quedan en `MAUI-PWA-customers/tareas/demo-feedback.md` (mismo archivo que el RFC original).

---

## 14. Referencias

- Análisis PO completo: `docs/rq-PO-admin-panel-fase0.md`
- RFC aprobado demo: `docs/demo-maui-pwa-rfc.md`
- Roadmap admin original: `maui-admin-front/tareas/roadmap-admin.md`
- Contexto MAUI: `MAUI-PWA-customers/MAUI-CONTEXT.md`
- Tipos source-of-truth: `MAUI-PWA-customers/src/types/orderService.ts`
- Patrón de mock: `MAUI-PWA-customers/src/services/mockOrderService.ts`
