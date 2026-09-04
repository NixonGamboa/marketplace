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

Toda la documentación vive bajo [`docs/`](docs/). Cada archivo tiene un rol único:

### Estado y coordinación del proyecto

| Documento | Propósito |
|---|---|
| [`docs/plan-implementacion.md`](docs/plan-implementacion.md) | **Documento vivo.** Estado global "¿en qué vamos y qué falta?". Bitácora cronológica, fases, tareas y decisiones canónicas. Se actualiza en cada avance material. |
| [`tech/backlog.md`](tech/backlog.md) | Backlog técnico gestionado por el SDD Kit (TODO / DEBT / IDEA). |

### Decisiones canónicas (ADRs)

| Documento | Propósito |
|---|---|
| [`docs/adr-001-vercel-postgres-first.md`](docs/adr-001-vercel-postgres-first.md) | Por qué el backend arranca en **Vercel Functions + Neon Postgres + Drizzle** en vez de AWS SAM + DynamoDB, y bajo qué condiciones se migraría después. |

### Propuestas técnicas (RFCs)

| Documento | Propósito |
|---|---|
| [`docs/demo-maui-pwa-rfc.md`](docs/demo-maui-pwa-rfc.md) | RFC aprobado del sprint DEMO: validar hipótesis de producto con usuarios reales antes de invertir en backend. Define el alcance, el flujo end-to-end y los criterios de éxito. |

### Producto y estrategia

| Documento | Propósito |
|---|---|
| [`MAUI-PWA-customers/MAUI-CONTEXT.md`](MAUI-PWA-customers/MAUI-CONTEXT.md) | **Qué es MAUI**, objetivo del producto, perfil del usuario, principios. Insumo obligatorio antes de decisiones de diseño o arquitectura. |
| [`docs/analisis-pm-mvp-ff.md`](docs/analisis-pm-mvp-ff.md) | Análisis PM del MVP para el Friends & Family en Dolores: qué construir, qué sobra, qué falta. |
| [`docs/rq-PO-admin-panel-fase0.md`](docs/rq-PO-admin-panel-fase0.md) | Review de Product Owner del panel admin en Fase 0: gaps de UX y priorización. |
| [`docs/pitch-deck.md`](docs/pitch-deck.md) | Pitch deck del proyecto (WIP). |

### Roadmaps por horizonte

| Documento | Propósito |
|---|---|
| [`docs/roadmap-v2.md`](docs/roadmap-v2.md) | Post F&F: cerrar la brecha "MVP funcional → producto operable sin intervención técnica". Se activa tras 50+ pedidos reales. |
| [`docs/roadmap-v3.md`](docs/roadmap-v3.md) | Escala y SaaS multi-aliado. Se activa con 2+ aliados y modelo de negocio validado. |
| [`docs/grow-ideas.md`](docs/grow-ideas.md) | Ideas de mejora explícitamente **posteriores** al MVP 100% funcional. No priorizadas. |

### Packages con documentación propia

| Documento | Propósito |
|---|---|
| [`maui-back/README.md`](maui-back/README.md) | Backend: setup, comandos, layout portable, ciclo de migraciones Drizzle/Neon, migración futura a AWS Lambda. |
| [`MAUI-PWA-customers/README.md`](MAUI-PWA-customers/README.md) | PWA de clientes: cómo levantar, build unificado, service worker. |
| [`MAUI Design System/README.md`](MAUI%20Design%20System/README.md) | Design system: tokens, componentes, brand assets. |

### Instrucciones para asistentes IA

| Documento | Propósito |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Reglas del proyecto para Claude Code: workflow SDD, idioma de specs, punteros a documentos canónicos. |
| [`MAUI-PWA-customers/CLAUDE.md`](MAUI-PWA-customers/CLAUDE.md) | Reglas específicas del paquete PWA. |

---

## Empezar rápido

- **Ver estado actual:** [`docs/plan-implementacion.md`](docs/plan-implementacion.md).
- **Entender qué es MAUI:** [`MAUI-PWA-customers/MAUI-CONTEXT.md`](MAUI-PWA-customers/MAUI-CONTEXT.md).
- **Levantar la PWA localmente:** `cd MAUI-PWA-customers && npm install && npm run dev`.
- **Levantar el backend localmente:** ver [`maui-back/README.md`](maui-back/README.md).
- **Deployar:** cada push a `master` dispara auto-deploy a Production; cada push a `develop` genera Preview.
