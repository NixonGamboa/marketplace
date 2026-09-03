# MAUI — Plan de Implementación Global

> **Documento vivo.** Se actualiza cada vez que una fase avanza, se completa o cambia.
> **Última actualización:** 2026-09-03
> **Owner:** Nixon Gamboa

---

## Propósito

Documento único de referencia para responder "¿en qué vamos y qué falta?" del proyecto MAUI end-to-end. Consolida el estado de las decisiones tomadas, el trabajo hecho y el trabajo pendiente por fase.

**No sustituye** al RFC (`docs/demo-maui-pwa-rfc.md`), al ADR (`docs/adr-001-vercel-postgres-first.md`), a los roadmaps (`roadmap-v2.md`, `roadmap-v3.md`) ni al SDD Kit (`tech/`). Los enlaza y los coordina.

---

## Decisiones canónicas vigentes

| # | Decisión | Documento fuente | Fecha |
|---|---|---|---|
| D-1 | Construir demo funcional antes del backend real | `docs/demo-maui-pwa-rfc.md` | 2026-06-02 |
| D-2 | Contratos mock = contratos reales; swap por import | RFC §3.3 | 2026-06-02 |
| D-3 | PWA + admin en un solo artefacto estático (deploy unificado) | `scripts/merge-unified-build.mjs` | 2026-09-03 |
| D-4 | Backend real arranca en **Vercel Functions + Neon Postgres**, no AWS SAM | `docs/adr-001-vercel-postgres-first.md` | 2026-09-03 |
| D-5 | Layout portable: `domain/` + `usecases/` + `infra/` para que migración a AWS Lambda + DynamoDB sea barata | ADR-001 §4 | 2026-09-03 |
| D-6 | Query builder = **Drizzle** (no Prisma) | ADR-001 §2 | 2026-09-03 |
| D-7 | IDs = **ULID**, timestamps = ISO strings, JSONB para atributos flexibles | ADR-001 §4 | 2026-09-03 |
| D-8 | Auth real = JWT propio o provider serverless (Clerk/Supabase) — pendiente elegir | ADR-001 §2 | 2026-09-03 |

---

## Fases

### Fase 0 — Fundacional (demo + validación)

Objetivo: PWA + admin funcionando end-to-end con mocks + datos reales de Leche y Miel; desplegado en URL pública; validado con usuarios en Dolores.

| # | Tarea | Estado | Notas |
|---|---|---|---|
| 0.1 | PWA con flujo completo (Home → Catálogo → Carrito → Checkout → Confirmación → Timeline pedido) | ✅ | Feature archivada en `tech/features/20260602-demo-maui-pwa/` |
| 0.2 | Catálogo con datos reales de Leche y Miel | ✅ | `shared/catalog` |
| 0.3 | Admin panel con roles, catálogo, horarios, audit log | ✅ | Feature en cierre `tech/wip/20260611-evolucion-admin-panel-demo/` |
| 0.4 | Deploy unificado (PWA + admin, un artefacto) | 🟡 | Build listo (`npm run build:unified`); falta publicar en Vercel |
| 0.5 | Enlazar auto-deploy Vercel a rama `feature/demo-maui-pwa` | 🔴 | Pendiente crear proyecto Vercel |
| 0.6 | Sesiones de validación con 5 usuarios de Dolores + empleado L&M | 🔴 | Fase 2 del RFC — pendiente ejecutar |
| 0.7 | Go/No-Go documentado con evidencia | 🔴 | Depende de 0.6 |

**Bloqueador de Fase 0:** ninguno técnico. La URL pública se desbloquea al hacer 0.4/0.5.

---

### Fase 1 — Backend real (arranque)

Objetivo: Reemplazar mocks del PWA/admin por backend real sobre Vercel Functions + Neon Postgres, sin romper contratos.

**Documento canónico:** `docs/adr-001-vercel-postgres-first.md`.

| # | Tarea | Estado | Notas |
|---|---|---|---|
| 1.1 | Scaffold `maui-back/` con layout portable | ✅ | 31 archivos, typecheck + tests verdes 2026-09-03 |
| 1.2 | Orders end-to-end (create, findById, listByStore, updateStatus) | ✅ | Usecases + adapters memory/postgres + tests |
| 1.3 | Crear proyecto Neon + `DATABASE_URL` | 🟡 | Bloqueado por reload de sesión con MCP Neon |
| 1.4 | `db:generate` + `db:migrate` inicial | 🔴 | Depende de 1.3 |
| 1.5 | Deploy `maui-back/` a Vercel + env vars | 🔴 | Depende de 1.3 |
| 1.6 | Elegir stack de Auth (JWT propio vs Clerk vs Supabase Auth) | 🔴 | Decisión pendiente |
| 1.7 | Endpoints faltantes: `catalog CRUD`, `store settings`, `merchant`, `audit`, `auth` | 🔴 | Cada uno como pequeña feature |
| 1.8 | Mover DTOs a `shared/` (raíz) para import compartido back ↔ front | 🔴 | `shared/` existe vacío |
| 1.9 | Swap frontend: `VITE_DEMO_MODE=false` → `services/index.ts` apunta a `realOrderRepository` | 🔴 | Requiere 1.5 + 1.8 |
| 1.10 | Integration tests contra Postgres real | 🔴 | Nice-to-have; después de 1.5 |
| 1.11 | WhatsApp Gateway (Evolution API en VPS) según RFC §3.2 | 🔴 | No iniciado |

**Bloqueador de Fase 1:** reload de sesión con Neon MCP (1.3).

---

### Fase 2 — Post-F&F (v2 del roadmap)

Objetivo: Cerrar la brecha entre "MVP funcional" y "producto operable sin intervención técnica".

Ver `roadmap-v2.md`. Se activa después de 50+ pedidos reales procesados.

| # | Tarea | Estado |
|---|---|---|
| 2.1 | Auth Magic Link completo por WhatsApp | 🔴 |
| 2.2 | Tracker de pedido en tiempo real (evaluar WebSocket vs SSE vs polling) | 🔴 |
| 2.3 | Devoluciones / plan B — actualmente resueltos por WhatsApp directo | 🔴 |
| 2.4 | Fotos en S3 con presigned URLs | 🔴 |

---

### Fase 3 — Escala / SaaS

Objetivo: Producto repetible multi-aliado + monetización automática.

Ver `roadmap-v3.md`. Se activa con 2+ aliados y modelo de negocio validado.

| # | Tarea | Estado |
|---|---|---|
| 3.1 | Wallet de prepago del aliado + débito automático | 🔴 |
| 3.2 | Multi-tenant isolation (por `storeId` en JWT) | 🔴 |
| 3.3 | **Evaluar migración a AWS Lambda + DynamoDB** (ver ADR-001 §5 para criterios) | 🔴 |

---

## Camino crítico corto plazo (próximas 2 semanas)

1. **Deploy demo a Vercel** — URL pública viva → desbloquea Fase 2 del RFC (validación)
2. **Setup Neon + primer endpoint real** — prueba de concepto del stack elegido
3. **Regularizar SDD** — `/tech.start` retroactivo para el scaffold + `/tech.fix` para actualizar Cognito en feature en curso
4. **Elegir stack de Auth** — bloquea todos los endpoints protegidos
5. **Mover DTOs a `shared/`** — establecer contrato back ↔ front antes de escribir más endpoints

---

## Gobernanza y proceso

### SDD Kit — deuda de proceso identificada
- `tech/wip/20260611-evolucion-admin-panel-demo/` menciona "Cognito" en 2 líneas de sus specs — requiere `/tech.fix` cuando se retome la feature (evitar edit manual respetando el workflow).
- El scaffold `maui-back/` se creó fuera del workflow SDD por velocidad. **Regularizar con `/tech.start` retroactivo** creando spec técnica corta que documente el layout ya construido.

### Actualizaciones que requiere este documento
- Cada vez que una fila cambie de estado (🔴 → 🟡 → ✅), actualizar aquí + fecha en el header.
- Cada nueva decisión arquitectural se registra en la tabla "Decisiones canónicas" con enlace al documento fuente.
- Los cambios de fase entera se anuncian en el commit message del cambio.

---

## Riesgos vigentes

| Riesgo | Mitigación |
|---|---|
| Vercel Hobby "non-commercial" restringe operación real de L&M | Upgrade a Pro (USD 20/mes) cuando MAUI opere comercialmente de forma recurrente |
| Neon cold starts en free tier | Aceptable en MVP; upgrade cuando el UX lo demande |
| Divergencia contrato mock ↔ real | Contratos como `interface` compartidas en `shared/` (pendiente 1.8) |
| WhatsApp Gateway no iniciado | Bloqueará Fase 1 completa; empezar warming del número 2 semanas antes del cutover |
| Sesiones de validación (0.6) sin fecha aún | Fijar semana calendario apenas 0.5 esté verde |

---

## Enlaces rápidos

- RFC demo: [`docs/demo-maui-pwa-rfc.md`](demo-maui-pwa-rfc.md)
- ADR stack: [`docs/adr-001-vercel-postgres-first.md`](adr-001-vercel-postgres-first.md)
- Análisis PO admin: [`docs/rq-PO-admin-panel-fase0.md`](rq-PO-admin-panel-fase0.md)
- Roadmap v2 (post F&F): [`../roadmap-v2.md`](../roadmap-v2.md)
- Roadmap v3 (escala/SaaS): [`../roadmap-v3.md`](../roadmap-v3.md)
- Backlog técnico SDD: [`../tech/backlog.md`](../tech/backlog.md)
- Backend: [`../maui-back/README.md`](../maui-back/README.md)
