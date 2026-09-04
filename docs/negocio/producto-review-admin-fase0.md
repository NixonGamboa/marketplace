# Análisis MAUI Admin — Product Owner Review

## 1. Objetivo del Admin (según docs)

Según `MAUI-CONTEXT.md` y `roadmap-admin.md`:

> *"Panel de administración para gestionar **pedidos**, actualizar **inventario**, subir fotos de calidad y confirmar **pesos reales**"*

**Audiencia:** 1–2 empleados de Leche y Miel operando desde **tablet/PC** con clientes físicos al frente (no es mobile-first, es desktop-first con alertas invasivas).

**Cierra el loop de valor:** sin Admin, el RFC explícitamente dice que el flujo extremo-a-extremo no funciona (CU-6).

---

## 2. Estado actual del Admin vs. lo planeado

Lo que existe hoy (`maui-admin-front/src/`):

| Feature | Roadmap | Implementado |
|---|---|---|
| ADMIN-001 Auth + sesión | ✅ planeado | ❌ no hay login, no hay rutas protegidas |
| ADMIN-002 Lista de pedidos | ✅ planeado | ⚠️ parcial: tabla básica, sin tabs por estado, sin alertas sonoras, sin badge "nuevo pedido" |
| ADMIN-003 Detalle + transición | ✅ planeado | ⚠️ parcial: avanza estado, link WhatsApp, **pero no captura pesos reales** ni permite cancelar con motivo |
| ADMIN-004 Catálogo CRUD | ✅ planeado | ❌ no existe |
| ADMIN-005 Toggle tienda | ✅ planeado | ❌ no existe |
| Cliente/teléfono click → WhatsApp | spec dice clickable | ❌ no clickable, no se guarda teléfono |

---

## 3. Modelos: **DESALINEADOS** con el PWA

El admin declara sus propios tipos en `src/types/order.ts` con un comentario *"Intentionally replicated… Source of truth: …orderService.ts"*. Hoy están **divergidos**:

| Campo | PWA (`orderService.ts`) | Admin (`order.ts`) | Impacto |
|---|---|---|---|
| `Order.userId` | ✅ presente | ❌ falta | Admin no puede filtrar por cliente ni perfilar |
| `CartItem` | `{id, qty, priceAtMoment}` (wire) | igual | El admin **muestra `item.id`** ("`leche-entera-1l`") en lugar del nombre. UX rota para el empleado |
| `CartItem.kilos` / `is_variable_weight` | en PWA está en cart store | ausente | No se puede pesar queso campesino, contra requisito de RFC §2.4 y ADMIN-003 |
| Catálogo (`Product`, `Category`) | tipos completos en PWA | inexistentes | Admin desconoce productos: no hay forma de mostrar nombre, foto, ni de gestionar |

**Riesgo:** el comentario "*source of truth*" es papel mojado — no hay test ni build que valide el contrato. Cuando llegue el backend real, la divergencia explota.

---

## 4. Recomendaciones (como Product Owner)

### A. Cerrar el loop de la demo (lo crítico para Fase 2)

1. **Sembrar contrato compartido**: extraer `types/orderService.ts` y `types/catalog.ts` a un paquete `shared/` (o copia con check de TS en CI) y consumirlo desde ambos proyectos. Eliminar la divergencia de `userId` y enriquecer `CartItem` para que el admin muestre nombre del producto.
2. **Mostrar nombres de productos, no SKUs**: el admin debe leer el catálogo (mock) para resolver `id → name_display`. Hoy el empleado ve códigos.
3. **Captura de pesos reales** (ADMIN-003): bloqueador de Fase 2 — el RFC FU-1/QA dice que el queso campesino es variable weight; el admin no soporta el cierre.
4. **Tabs por estado + alerta sonora**: el empleado opera con clientes presenciales — sin alerta invasiva pierde pedidos.
5. **Seed propio del admin**: hoy el admin depende de que la PWA haya corrido en el mismo navegador. Para demos en vivo (otra tablet, otra sesión), aplicar el mismo patrón de seed del PWA (`maui-orders-seeded-v1`) **del lado admin**, idempotente.

### B. Seguridad / Roles / Auth (incluso en demo)

El roadmap propone "user/pass hardcodeado vía env". Para demo realista propongo dos capas:

| Capa | Propuesta |
|---|---|
| **Autenticación** | `LoginPage` con credenciales `VITE_ADMIN_USER` / `VITE_ADMIN_PASS`; `sessionStorage.maui-admin-session = {user, role, exp}` con expiración 8h |
| **Autorización por roles** | `owner` (todo) · `operator` (solo pedidos, sin catálogo ni horarios) · `viewer` (lectura, útil para entrenamiento). Roles en el mock user. |
| **Ruta protegida** | `<RequireAuth role="operator">` envolviendo rutas; redirect a `/login` |
| **Audit log mock** | array en localStorage `maui-admin-audit` con `{user, action, orderId, at}` — cada cambio de estado lo registra. Da realismo y prepara el evento para Sprint 1 |
| **Multi-tenant placeholder** | guardar `merchantId` en sesión aunque hoy solo exista L&M; evita rework |
| **Producción (Sprint 1+)** | Auth provider real (stack en `../tecnicos/adr-001-stack-backend.md`) emitiendo JWT con claim `role`; el `RequireAuth` lee el claim — la firma del hook no cambia |

Esto es **mock**, pero deja el contrato listo para el backend (mismas firmas, mismas guards).

### C. Capa de mock repositories del Admin (espejo del PWA)

Hoy el admin tiene `lib/localStorage.ts` plano. Propongo paralelismo con el PWA:

```
maui-admin-front/src/
├── services/
│   ├── index.ts                      ← swap por VITE_DEMO_MODE
│   ├── mockOrderRepository.ts        ← list/getById/updateStatus/setRealWeights/cancel
│   ├── mockCatalogRepository.ts      ← CRUD productos + categorías + toggle stock
│   ├── mockStoreStatusRepository.ts  ← override open/closed + schedule
│   ├── mockAuthRepository.ts         ← login/logout/getSession + roles
│   └── mockAuditRepository.ts        ← log eventos
└── types/  ← compartidos con PWA
```

Cada repo: **delays realistas** (300–800ms), **seed idempotente**, **claves localStorage con namespace** (`maui-admin-*`). Mismo contrato `interface OrderRepository` que el real, swap por feature flag.

### D. Funciones de plataforma que faltan para "panel real"

Más allá del roadmap, como PO veo huecos:

- **Dashboard de hoy**: # pedidos por estado, ticket promedio, alertas activas. 30s de mirada y el empleado sabe en qué está.
- **Búsqueda/filtro de pedidos** por nombre, teléfono, fecha.
- **Acción "Reasignar / cancelar"** con motivo (hoy solo avanza; no retrocede ni cancela).
- **Imprimir / compartir picking list** (PDF o copia plana para llevar al piso de tienda).
- **Histórico** más allá de hoy (filtro por rango de fecha).
- **Notificaciones nativas Web Push** además del sonido (cuando la tablet está en otra pestaña).
- **Configuración del aliado**: WhatsApp del negocio, dirección, horarios — hoy hardcoded en `config/whatsapp.ts`.

---

## 5. Priorización sugerida (sprint demo)

| # | Item | Por qué |
|---|---|---|
| P0 | Mostrar nombres reales de productos (resolver SKU→Product) | Demo se cae sin esto |
| P0 | Seed propio del admin idempotente | Demos en cualquier dispositivo |
| P0 | Pesos reales en ítems variables | Bloqueante RFC FU-1 |
| P0 | Tabs por estado + alerta sonora "nuevo pedido" | Loop operativo (CU-6) |
| P1 | Auth mock con roles + audit log | Realismo para validación con dueño L&M |
| P1 | Toggle abierto/cerrado + horario | Cierra ciclo de control |
| P1 | CRUD catálogo (mock) con stock toggle rápido | Independiza al aliado |
| P2 | Dashboard de hoy + búsqueda | UX de panel "serio" |
| P2 | Tipos compartidos en paquete/CI | Deuda técnica pre-Sprint 1 |
