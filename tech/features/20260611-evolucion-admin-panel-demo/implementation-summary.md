# Implementation Summary — evolucion-admin-panel-demo

## Métricas generales

| Métrica | Valor |
|---|---|
| Tasks totales | 30 (+ 3 mejoras post-approval E-1..E-3) |
| Tasks completadas | 30/30 (100%) |
| Commits de implementación | 12 |
| Archivos nuevos creados | ~85 |
| Tests | 67 tests / 10 suites |
| Bundle size (gzip) | 97.81 KB admin + ~280 KB PWA |
| Plataforma | frontend-web (React 19 + Vite 7) |

## Commits por capa

| Commit | Descripción |
|---|---|
| `2698496` | feat(types): tipos compartidos PWA↔admin + drift check (TASK-001..003) |
| `f319f8b` | feat(services): capa de mock repositories + helpers (TASK-004..010) |
| `a8a2672` | feat(admin/shell): AppShell + auth guards + UI base + dashboard (TASK-011..015) |
| `dfe713a` | feat(admin/orders): flujo operativo completo con alertas (TASK-016..019) |
| `433ea88` | feat(admin/owner): pantallas de gestión del dueño (TASK-020..025) |
| `c8f5972` | fix(admin/services): CatalogRepository `by` + seed fallback resiliente |
| `0bfb679` | test(admin): tests unitarios de mocks y helpers (TASK-026) |
| `bec5a6b` | chore(admin/lint): ESLint 9 flat config + typescript-eslint |
| `2d1259f` | feat(shared/catalog): baseline único de productos L&M (E-1) |
| `f3b1d6e` | feat(deploy): origin unificado + build merged (E-2) |
| `f20d377` | fix(pwa/sw): excluir /admin del service worker (E-3) |
| `c87f857` | docs(tech/wip): registrar mejoras post-cierre en meta.md |

## Decisions técnicas clave

| ADR | Decisión | Por qué |
|---|---|---|
| ADR-001 | Un solo `localStorage['maui-orders']` compartido entre PWA y admin | El backend real reemplazará este canal; la firma de cada repo no cambia |
| ADR-002 | Tipos replicados byte-a-byte + drift-check en CI | Monorepo sin build step compartido; script diff garantiza sincronía |
| ADR-003 | `storage` event para detección cross-tab (no polling) | Bajo consumo; reacciona en <100ms; requiere mismo origin |
| ADR-006 | `priceAtMoment` = precio/kg para `is_variable_weight` | Evita campo extra; el admin multiplica `kilosReal × priceAtMoment` |
| ADR-007 | `customerPhone` en pedido, no `merchant.whatsapp` | El CTA de contacto es al cliente, no al negocio; merchant.whatsapp sólo en /configuracion |
| ADR-008 | Búsqueda por teléfono: 4 dígitos → suffix, >4 → includes | Equilibrio privacidad/usabilidad; el empleado busca por los últimos 4 sin ver el número completo |

## Deuda técnica registrada

| ID | Descripción | Blocker |
|---|---|---|
| DEBT-001 | Evidencia fotográfica de pesos reales en OrderDetail | Requiere Object Storage real (Sprint 1) |

## Cobertura por área crítica

| Área | Tests |
|---|---|
| mockAuditRepository | FIFO 500, orden desc, id/at |
| mockOrderRepository | list/setRealWeights (ADR-006)/cancel/updateStatus |
| mockAuthRepository | login/logout/getSession TTL |
| mockStoreStatusRepository | isOpenNow 3 paths + límites horario |
| lib/phone | normalize/format/last4/matchesQuery (ADR-008) |
| RequireAuth | guard sin sesión / rol insuficiente / rol válido |
| OrdersListPage | búsqueda multi-campo, tabs, phone suffix |
| OrderDetailPage | pesos variables, cancel, contacto |
| useNewOrdersWatcher | storage event, known-ids, no doble-alerta |
| catalogSeed | siembra desde shared, idempotencia, migración v1→v2, reset |
