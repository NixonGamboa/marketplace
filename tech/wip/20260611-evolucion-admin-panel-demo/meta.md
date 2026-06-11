# Feature Meta — evolucion-admin-panel-demo

## Identity

```yaml
feature_name: evolucion-admin-panel-demo
feature_date: 20260611
feature_folder: tech/wip/20260611-evolucion-admin-panel-demo
project_mode: brownfield
execution_mode: standard
project_type: mvp
spec_language: es
```

## Description

Evolucionar la app `maui-admin-front` para cumplir el roadmap ADMIN completo en modo demo (sin backend real).
Todos los repositorios quedan como mocks con contratos listos para swap a backend real en Sprint 1.
Alcance completo documentado en `docs/rq-PO-admin-panel-fase0.md`.

## Saved Context (for /tech.spec)

Evolucionar la PWA admin (maui-admin-front) para cumplir el roadmap-admin completo, los gaps identificados en docs/rq-PO-admin-panel-fase0.md y dejar el panel listo para la Fase 2 de validación con usuarios. Alcance limitado a la demo: SIN backend real, todo vía mocked repositories con seed idempotente y contrato listo para swap a backend en Sprint 1.

Incluye:
1. Alinear tipos con el PWA (compartir/replicar Order + CartItem + Product + Category con userId y kilos)
2. Resolver SKU→nombre de producto en la UI del admin (mockCatalogRepository)
3. Captura de pesos reales para ítems is_variable_weight en OrderDetail
4. Tabs por estado + alerta sonora + badge "nuevo pedido" en OrdersList
5. Seed propio del admin idempotente (independiente del PWA, funciona en cualquier dispositivo)
6. Auth mock: LoginPage con VITE_ADMIN_USER/PASS, sessionStorage con expiración 8h, roles owner/operator/viewer, guard RequireAuth
7. Audit log mock en localStorage (maui-admin-audit)
8. merchantId placeholder multi-tenant en sesión
9. Capa mockRepositories espejo del PWA: mockOrderRepository, mockCatalogRepository, mockStoreStatusRepository, mockAuthRepository, mockAuditRepository — delays 300–800ms, namespace maui-admin-*, swap por VITE_DEMO_MODE
10. CRUD catálogo: productos + categorías + toggle rápido de stock desde lista
11. Toggle abierto/cerrado de tienda + configuración de horario semanal
12. Cancelar pedido con motivo obligatorio (además de avanzar estado)
13. Dashboard "hoy": pedidos por estado, ticket promedio, alertas activas
14. Búsqueda/filtro de pedidos por nombre, teléfono, fecha
15. Picking list imprimible/copiable por pedido
16. Histórico por rango de fechas
17. Web Push opcional (cuando la tablet está en otra pestaña)
18. Configuración del aliado editable: WhatsApp del negocio, dirección, horarios

## Stack

```yaml
language: TypeScript
framework: React 19 + Vite 7
styling: TailwindCSS 3
routing: React Router DOM 7
platform: web
app: maui-admin-front
```

## Project Type Settings

```yaml
project_type: mvp
tests_required: true
coverage_target: critical paths only
e2e_enabled: false
```

## User Profile

```yaml
user_profile:
  type: technical
  source: global
  selected_at: 2026-06-11
```

## References

- Análisis PO completo: `docs/rq-PO-admin-panel-fase0.md`
- Roadmap admin original: `maui-admin-front/tareas/roadmap-admin.md`
- RFC demo aprobado: `docs/demo-maui-pwa-rfc.md`
- Contexto MAUI: `MAUI-PWA-customers/MAUI-CONTEXT.md`
- Tipos del PWA (source of truth): `MAUI-PWA-customers/src/types/orderService.ts`
- Mock del PWA (referencia de patrón): `MAUI-PWA-customers/src/services/mockOrderService.ts`

## Workflow Status

```yaml
phase_1_functional: approved
phase_2_technical: approved
phase_3_tasks: approved
phase_3_tasks_approved_by: Nixon Gamboa
phase_3_tasks_approved_at: 2026-06-11
phase_3_tasks_total: 30
phase_3_tasks_strategy: batched
phase_4_implementation: pending
```
