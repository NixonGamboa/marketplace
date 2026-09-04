# MAUI — Plan de Implementación Global

> **Documento vivo.** Se actualiza cada vez que una fase avanza, se completa o cambia.
> **Última actualización:** 2026-09-03 (sesión noche — deploy Production verde)
> **Owner:** Nixon Gamboa

---

## Propósito

Documento único de referencia para responder "¿en qué vamos y qué falta?" del proyecto MAUI end-to-end. Consolida el estado de las decisiones tomadas, el trabajo hecho y el trabajo pendiente por fase.

**No sustituye** al RFC (`docs/demo-maui-pwa-rfc.md`), al ADR (`docs/adr-001-vercel-postgres-first.md`), a los roadmaps (`roadmap-v2.md`, `roadmap-v3.md`) ni al SDD Kit (`tech/`). Los enlaza y los coordina.

---

## Bitácora

Cronología de decisiones y avances materiales. Entradas nuevas van arriba.

### 2026-09-03 (sesión noche cierre) — Deploy Production verde + merge a master

- **Merge `feature/demo-maui-pwa` → `master` (198a9e9)** con `--no-ff`. Master estaba 3 commits atrás por trabajo ajeno "post-descarga zip" (b7292e6). Divergencia real → merge no fast-forward.
- **Conflictos resueltos:** 2 modify/delete en la carpeta `MAUI-PWA-customers/client/` (eliminada por la reorg de la feature). Aceptados los deletes; los cambios de master en `mockData.ts` y `roadmap.md` eran sobre archivos que ya no existen en la estructura nueva.
- **Housekeeping (48be718):** `git rm --cached .claude/settings.local.json` — el `.gitignore` mergeado ya lo cubre; ahora también des-trackeado. El archivo local del usuario sobrevive (283 bytes).
- **Auto-deploy Production confirmado end-to-end:** push a master → Vercel dispara build con `Environment=Production` sin intervención manual. **URL bonita viva:**
  - `https://marketplace-pied-xi.vercel.app/` → 200 (PWA customers)
  - `https://marketplace-pied-xi.vercel.app/admin/` → 200 (admin panel)
- **Fix móvil admin incluido:** drawer overlay + hamburguesa (`maui-admin-front/src/shell/AppShell.tsx`, commit `022b529`). Typecheck limpio, 67 tests verde. Falta validación visual del owner en móvil real.
- **Observación performance:** el `npm ci` explícito por subfolder que agregué al orquestador raíz hace builds Vercel de ~10min (vs 33s de deploys anteriores sin unificar). No bloqueante, pero candidato a optimizar migrando a npm workspaces o dejando que Vercel cachee `node_modules` por subfolder.

### 2026-09-03 (sesión noche) — Vercel CLI autenticada + auditoría proyecto `marketplace`

- **Login OK** via Device Flow (OAuth 2.0). CLI actualizada a v59.11.2. Cuenta: `infogamboatech-2785`.
- **Proyecto `marketplace` linkeado** a `maui-back/` (crea `.vercel/` local + `.env.local` con `VERCEL_OIDC_TOKEN`).
- **Config actual del proyecto Vercel (auditada con `vercel project inspect`):**
  - ID: `prj_JJSJxLWORkC7WVZGcGziLPxGQ4dk`
  - **Root Directory: `.`** ← problemático (ver diagnóstico)
  - Framework Preset: `Other` (no detectó Vite)
  - Build Command: `npm run vercel-build` or `npm run build`
  - Output Directory: `public` o `.`
  - Node: 24.x, Region: iad1
  - **Env Vars: cero configuradas**
- **Último deploy (26 min): Ready pero roto.**
  - URL: `https://marketplace-1hjo500nw-infogamboatech-2785.vercel.app`
  - Duración build: 5s (build vacío)
  - Prod URL (`https://marketplace-pied-xi.vercel.app`) devuelve **404 NOT_FOUND**
- **Diagnóstico de raíz:**
  - **No existe `package.json` en la raíz del repo** — Vercel con Root `.` no encontró nada para construir.
  - El build unificado real vive en `MAUI-PWA-customers/package.json`: script `build:unified` = `vite build --mode demo && cd ../maui-admin-front && npm run build:unified && node ../scripts/merge-unified-build.mjs`.
  - El output final va a `MAUI-PWA-customers/dist/` (según convención del merge script).
- **Decisión tomada: Opción B (orquestador raíz).**
  - Creado `package.json` en raíz (`maui-monorepo`, private, sin deps propias) con scripts `install:pwa`, `install:admin`, `install:all`, `build:unified`, `vercel-build`.
  - Creado `vercel.json` en raíz: `buildCommand=npm run vercel-build`, `outputDirectory=MAUI-PWA-customers/dist`, `installCommand=npm install`, `framework=null`.
  - **Sin npm workspaces** (evita romper package-locks individuales); el script raíz corre `npm ci` por subfolder de forma explícita antes del build.
  - `maui-back/vercel.json` no interfiere (Vercel lee el del Root Directory `.`).
  - **Dry-run local falló por EPERM en Windows** (esbuild binario bloqueado) — no bloqueante, es limitación de Windows filesystem; Vercel Linux no tendrá el problema. Validación real será en el próximo deploy tras push.

### 2026-09-03 (sesión tarde) — Setup deploy demo + backend scaffold + docs

- **Decisión D-4 → D-8 tomadas:** stack backend cambia de AWS SAM + DynamoDB + Cognito a Vercel Functions + Neon Postgres + Drizzle + JWT propio. Documentada en ADR-001. Ver `docs/adr-001-vercel-postgres-first.md`.
- **Docs previos actualizados** apuntando al ADR: RFC, PO analysis, roadmap v2/v3, análisis PM, MAUI-CONTEXT. Se respetó SDD: tech/wip **no fue editado** (regularizar vía `/tech.fix`).
- **Scaffold `maui-back/` creado** (31 archivos): domain/usecases/infra + adapters memory/postgres + handlers Vercel Functions para `/api/orders/*` y `/api/health`. `tsc --noEmit` limpio; `vitest` 9/9 verde.
- **`npm install` en maui-back:** 519 paquetes; 25 vulnerabilidades transitivas del CLI de vercel (no afectan runtime).
- **3 commits + push a `origin/feature/demo-maui-pwa`:**
  - `bcf2e4c` docs(adr): ADR-001 Vercel + Postgres
  - `d671273` feat(back): scaffold maui-back
  - `30a75e3` docs(plan): plan de implementación global
- **Neon MCP registrado** (`user` scope, HTTP OAuth) — CLI ok, sesión actual sin tools cargados. Reload pendiente.
- **Vercel:** Nixon importó manualmente el repo bajo cuenta Hobby (URL: `vercel.com/infogamboatech-2785/marketplace`). Config concreta **pendiente de verificar** (build command, root directory, production branch).
- **Limitación descubierta:** el MCP de Vercel **no soporta cuentas Hobby personales** — todas las llamadas devuelven 403 aunque el OAuth diga OK. Re-autenticación no lo arregla. Se usará Vercel CLI local desde `maui-back/` como fallback para inspección/config.

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
| 0.4 | Deploy unificado (PWA + admin, un artefacto) | ✅ | `package.json` raíz orquestador + `vercel.json` con `rewrites` SPA. Producción viva en `marketplace-pied-xi.vercel.app` (200 en `/` y `/admin/`). |
| 0.5 | Auto-deploy `master` → Production | ✅ | Verificado end-to-end 2026-09-03: push a master dispara build con `Environment=Production`. Rama de trabajo sigue generando Preview con URL única por commit. |
| 0.6 | Sesiones de validación con 5 usuarios de Dolores + empleado L&M | 🔴 | Fase 2 del RFC — pendiente ejecutar. **Desbloqueada** ahora que hay URL pública. |
| 0.7 | Go/No-Go documentado con evidencia | 🔴 | Depende de 0.6 |
| 0.8 | Validación visual del fix móvil del admin (drawer + hamburguesa) | 🟡 | Deploy incluye el fix; pendiente prueba en dispositivo real del owner. |

**Fase 0 sin bloqueadores técnicos.** El único pendiente crítico es la validación humana (0.6, 0.8).

---

### Fase 1 — Backend real (arranque)

Objetivo: Reemplazar mocks del PWA/admin por backend real sobre Vercel Functions + Neon Postgres, sin romper contratos.

**Documento canónico:** `docs/adr-001-vercel-postgres-first.md`.

| # | Tarea | Estado | Notas |
|---|---|---|---|
| 1.1 | Scaffold `maui-back/` con layout portable | ✅ | 31 archivos, typecheck + tests verdes 2026-09-03. Commit `d671273`. |
| 1.2 | Orders end-to-end (create, findById, listByStore, updateStatus) | ✅ | Usecases + adapters memory/postgres + tests 9/9. Adapter Dynamo pendiente para Fase 3. |
| 1.3 | Crear proyecto Neon + `DATABASE_URL` | 🟡 | Neon MCP registrado y autenticado; tools se cargan al reabrir sesión de Claude Code |
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

1. ✅ ~~Verificar config Vercel + primer deploy verde~~ (hecho 2026-09-03)
2. ✅ ~~Deploy demo verde en Vercel~~ — `marketplace-pied-xi.vercel.app` viva
3. **Validación móvil del fix admin drawer** — owner prueba en su celular (5 min)
4. **Agendar sesiones de validación con 5 usuarios de Dolores + empleado L&M** — Fase 2 del RFC (0.6). Fijar semana calendario.
5. **Setup Neon + primer endpoint real** — prueba de concepto del stack elegido (1.3-1.5)
6. **Regularizar SDD** — `/tech.start` retroactivo para el scaffold + `/tech.fix` para limpiar menciones a Cognito en feature en curso
7. **Elegir stack de Auth** — bloquea todos los endpoints protegidos (1.6)
8. **Mover DTOs a `shared/`** — establecer contrato back ↔ front antes de escribir más endpoints (1.8)
9. **Optimizar tiempo de build Vercel** (10min → 1-2min): evaluar npm workspaces o cache de `node_modules` por subfolder. No urgente.

---

## Herramientas / MCPs / CLIs

Estado de las herramientas que el asistente puede usar directamente (relevante para saber cuándo hay que ejecutar manualmente vs delegar).

| Herramienta | Estado | Notas |
|---|---|---|
| **MCP Vercel** | ⚠️ Autenticado pero **no funcional en cuenta Hobby personal** | Todas las llamadas devuelven 403. Limitación del server MCP (no del OAuth). Se reporta a Vercel si aparece feedback público. |
| **Vercel CLI** (`npx vercel`) | ✅ v59.11.2 autenticada como `infogamboatech-2785`; `maui-back/` linkeado a `marketplace` | `.vercel/` + `.env.local` creados en `maui-back/`. Funcionan `project inspect`, `env ls`, `ls`, `deploy`. El CLI no expone directamente el git repo asociado (solo dashboard). |
| **MCP Neon** | 🟡 Registrado y autenticado; tools no cargados en sesión activa | Reabrir Claude Code para que se materialicen las tools. |
| **MCP Google Drive** | ✅ Conectado | No usado activamente hoy. |
| **Git / GitHub CLI** | ✅ Disponible | Commits y push funcionan directamente. |

Cuando el MCP falla, el fallback es el CLI local invocado desde Bash. Para logins interactivos el usuario ejecuta `! <comando>` en el prompt.

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
