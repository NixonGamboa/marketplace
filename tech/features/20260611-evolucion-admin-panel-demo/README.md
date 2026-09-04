# Feature: evolucion-admin-panel-demo

**Estado**: Completada · **Fecha**: 2026-09-03 · **Owner**: Nixon Gamboa

## ¿Qué se construyó?

Panel de administración completo para Leche y Miel en modo demo (sin backend real),
que cierra el loop end-to-end del RFC: un cliente hace un pedido en la PWA →
el empleado lo ve en el admin, lo procesa, pesa los productos variables y contacta
al cliente por WhatsApp, todo desde la misma URL.

El admin corre en el mismo origin que la PWA (`/admin/`) compartiendo `localStorage`,
por lo que pedidos creados en la PWA aparecen en tiempo real en el panel mediante
el evento `storage` (ADR-003).

## Componentes entregados

### Capa de servicios (30/30 tasks originales)

| Repo | Responsabilidad |
|---|---|
| `mockOrderRepository` | list/getById/updateStatus/setRealWeights/cancel con audit |
| `mockCatalogRepository` | CRUD productos+categorías, toggle stock |
| `mockAuthRepository` | login/logout/getSession, TTL 8h, roles owner/operator |
| `mockStoreStatusRepository` | override manual + horario semanal + isOpenNow |
| `mockMerchantRepository` | config del aliado (WhatsApp, dirección) |
| `mockAuditRepository` | FIFO 500, crypto.randomUUID, export para tests |
| Seeds idempotentes | users/merchant/store/catalog — marker versionado (v2) |

### UI — Flujo operativo (empleado)

- **DashboardPage**: 5 cards por estado, ticket promedio, alertas received >5min
- **OrdersListPage**: 6 tabs (5 estados + Cancelados), búsqueda multi-campo, pulse en recibidos
- **OrderDetailPage**: WeightInput para kg reales, recálculo ADR-006, cancel con motivo, tap-to-call/WhatsApp
- **PickingListView**: impresión `@media print` + clipboard texto plano
- **NewOrderAlert + useNewOrdersWatcher**: detección cross-tab vía `storage`, sonido tras gesto
- **StoreOpenBanner**: refresca cada 30s + `storage` event → banner rojo si tienda cerrada

### UI — Funciones de owner

- **DashboardPage** con métricas del día
- **HistoricoPage**: filtro desde/hasta, default 30 días
- **CatalogoPage + ProductFormModal + StockToggle**: CRUD + toggle inline optimista + delete con confirm
- **CategoriasPage**: CRUD con slug auto + guard RN-7
- **TiendaPage**: 3 radios override + 7 filas horario semanal
- **ConfigPage + ResetDemoButton**: MerchantConfig editable + reset demo limpio (SC-12)
- **AuditPage**: últimos 200 eventos con filtro por action

### Infraestructura

- Auth mock: `AuthContext`, `RequireAuth` role-aware (owner/operator), `LoginPage`
- Sistema UI: Toast, Modal, ConfirmDialog, Spinner, EmptyState, Tabs, PriceInput, WeightInput
- ESLint 9 flat config + typescript-eslint + react-hooks
- Vitest + RTL + jsdom + 10 suites / 67 tests

### Post-approval (mejoras para Fase 2)

| # | Cambio | Commit |
|---|---|---|
| E-1 | `shared/catalog/` — baseline único de productos L&M consumido por PWA y admin | `2d1259f` |
| E-2 | Origin unificado (`dev:unified` + `build:unified`) para deploy bajo una URL | `f3b1d6e` |
| E-3 | SW excluye `/admin/*` (navigateFallbackDenylist + skipWaiting) | `f20d377` |

## Cómo correrlo

### Dev standalone (dos orígenes)
```bash
# Terminal 1
cd maui-admin-front && npm run dev        # :5174

# Terminal 2
cd MAUI-PWA-customers && npm run dev      # :5173
```

### Dev unificado (mismo origin, localStorage compartido)
```bash
cd MAUI-PWA-customers && npm run dev:unified  # :5173 con /admin proxeado a :5174
```

### Build + preview de deploy
```bash
cd MAUI-PWA-customers && npm run build:unified && npm run preview  # :4173
```

### Credenciales del admin (demo)
| Rol | Email | Password |
|---|---|---|
| Owner | `owner@lechemiel.demo` | `demo1234` |
| Operator | `operator@lechemiel.demo` | `demo1234` |

## Gates de calidad

| Gate | Resultado |
|---|---|
| typecheck (admin) | ✅ 0 errores |
| typecheck (PWA) | ✅ 0 errores |
| lint | ✅ 0 errores, 3 warnings cosméticos |
| tests | ✅ 67/67 |
| drift-check tipos PWA↔admin | ✅ types in sync |
| build gzip | ✅ 97.81 KB (objetivo <300 KB) |
| security scan (XSS / secrets) | ✅ sin hallazgos |

## Qué sigue (Fase 2)

1. Conseguir catálogo real de L&M (fotos WebP + precios verificados con el aliado)
2. Deploy a URL pública (`npm run build:unified` → `MAUI-PWA-customers/dist/` a Vercel/Netlify)
3. 5 sesiones de validación con usuarios de Dolores + walkthrough con el empleado
4. Documentar hallazgos en `tareas/demo-feedback.md`
5. Decisión Go/No-Go para Sprint 1 de backend (Vercel Functions + Neon per ADR-001)
