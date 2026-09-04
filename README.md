# MAUI

Plataforma para conectar personas con soluciones de sus comercios locales. Primer aliado: **Leche y Miel** (supermercado en Dolores, Tolima).

**Producción viva:** [`marketplace-pied-xi.vercel.app`](https://marketplace-pied-xi.vercel.app) (PWA en `/`, admin en `/admin/`).

---

## Arquitectura en una línea

Monorepo con **PWA de clientes**, **panel admin del aliado** y **backend serverless**, desplegado como un único proyecto Vercel en el mismo host.

```
/
├── api/                     # Vercel Functions (handlers HTTP, mismo host que PWA)
├── MAUI-PWA-customers/      # PWA de clientes (Vite + React)
├── maui-admin-front/        # Panel admin (Vite + React) — servido en /admin/
├── maui-back/               # Lógica del backend (domain / usecases / infra) + tests
├── shared/                  # Contratos y catálogo compartidos entre front y back
├── scripts/                 # Build unificado y utilidades
├── docs/                    # Toda la documentación estratégica y técnica
└── tech/                    # SDD Kit (specs formales por feature)
```

---

## Documentación por propósito

La documentación transversal vive bajo [`docs/`](docs/), separada en dos carpetas por audiencia principal:

- **`docs/tecnicos/`** — decisiones de arquitectura, RFCs y estado de implementación. Audiencia: ingeniería.
- **`docs/negocio/`** — producto, PM, PO, estrategia, roadmaps. Audiencia: PM/PO/dirección.

Cada archivo tiene un rol único.

### 📐 Técnicos — [`docs/tecnicos/`](docs/tecnicos/)

| Documento | Propósito |
|---|---|
| [`estado-plan.md`](docs/tecnicos/estado-plan.md) | **Documento vivo.** Estado global "¿en qué vamos y qué falta?". Bitácora cronológica, fases, tareas y decisiones canónicas. Se actualiza en cada avance material. |
| [`adr-001-stack-backend.md`](docs/tecnicos/adr-001-stack-backend.md) | Por qué el backend arranca en **Vercel Functions + Neon Postgres + Drizzle** en vez de AWS SAM + DynamoDB, y bajo qué condiciones se migraría después. |
| [`rfc-001-demo-validacion.md`](docs/tecnicos/rfc-001-demo-validacion.md) | RFC aprobado del sprint DEMO: validar hipótesis de producto con usuarios reales antes de invertir en backend. Alcance, flujo end-to-end y criterios de éxito. |
| [`tech/backlog.md`](tech/backlog.md) | Backlog técnico gestionado por el SDD Kit (TODO / DEBT / IDEA). Vive fuera de `docs/` porque lo gestiona el SDD Kit. |

### 💼 Negocio — [`docs/negocio/`](docs/negocio/)

| Documento | Propósito |
|---|---|
| [`producto-analisis-mvp-ff.md`](docs/negocio/producto-analisis-mvp-ff.md) | Análisis PM del MVP para el Friends & Family en Dolores: qué construir, qué sobra, qué falta. |
| [`producto-review-admin-fase0.md`](docs/negocio/producto-review-admin-fase0.md) | Review de Product Owner del panel admin en Fase 0: gaps de UX y priorización. |
| [`producto-ideas-post-mvp.md`](docs/negocio/producto-ideas-post-mvp.md) | Ideas de mejora explícitamente **posteriores** al MVP 100% funcional. No priorizadas. |
| [`estrategia-pitch-deck.md`](docs/negocio/estrategia-pitch-deck.md) | Pitch deck del proyecto (WIP). |
| [`roadmap-v2-post-ff.md`](docs/negocio/roadmap-v2-post-ff.md) | Post F&F: cerrar la brecha "MVP funcional → producto operable sin intervención técnica". Se activa tras 50+ pedidos reales. |
| [`roadmap-v3-saas-escala.md`](docs/negocio/roadmap-v3-saas-escala.md) | Escala y SaaS multi-aliado. Se activa con 2+ aliados y modelo de negocio validado. |

### 📦 Documentación específica por package

Cada package mantiene su propio README con setup y detalles internos.

| Documento | Propósito |
|---|---|
| [`MAUI-PWA-customers/MAUI-CONTEXT.md`](MAUI-PWA-customers/MAUI-CONTEXT.md) | **Qué es MAUI**, objetivo del producto, perfil del usuario, principios. Insumo obligatorio antes de decisiones de diseño o arquitectura. Vive en el package por historia; referenciado por specs SDD archivadas. |
| [`maui-back/README.md`](maui-back/README.md) | Backend: setup, comandos, layout portable, ciclo de migraciones Drizzle/Neon, migración futura a AWS Lambda. |
| [`MAUI-PWA-customers/README.md`](MAUI-PWA-customers/README.md) | PWA de clientes: cómo levantar, build unificado, service worker. |
| [`MAUI Design System/README.md`](MAUI%20Design%20System/README.md) | Design system: tokens, componentes, brand assets. |

### 🤖 Instrucciones para asistentes IA

| Documento | Propósito |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Reglas del proyecto para Claude Code: workflow SDD, idioma de specs, punteros a documentos canónicos. |
| [`MAUI-PWA-customers/CLAUDE.md`](MAUI-PWA-customers/CLAUDE.md) | Reglas específicas del paquete PWA. |

---

## Empezar rápido

- **Ver estado actual:** [`docs/tecnicos/estado-plan.md`](docs/tecnicos/estado-plan.md).
- **Entender qué es MAUI:** [`MAUI-PWA-customers/MAUI-CONTEXT.md`](MAUI-PWA-customers/MAUI-CONTEXT.md).
- **Levantar la PWA localmente:** `cd MAUI-PWA-customers && npm install && npm run dev`.
- **Levantar el backend localmente:** ver [`maui-back/README.md`](maui-back/README.md).
- **Deployar:** cada push a `master` dispara auto-deploy a Production; cada push a `develop` genera Preview.
