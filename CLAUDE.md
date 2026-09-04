## Tech SDD Kit

This project uses **Tech SDD Kit** for spec-driven development.

### Spec Language
All specifications MUST be written in **Spanish (Español)** (`es`).
Do not mix languages in specs. Technical terms (API, REST, CRUD, mock, store) stay in English.

### Quick Reference
- Framework expert: `Skill("tech-sdd-kit-expert")`
- Workflow: `/tech.start` → `/tech.spec` → `/tech.plan` → `/tech.build` → `/tech.finish`
- Active feature: `tech/wip/20260611-evolucion-admin-panel-demo/`
- **Plan de implementación global (fuente única de estado):** `docs/estado-plan.md`
- **ADR stack backend (Vercel + Postgres, no AWS al inicio):** `docs/adr-001-stack-backend.md`
- Análisis PO: `docs/producto-review-admin-fase0.md`
- RFC demo aprobado: `docs/rfc-001-demo-validacion.md`
- Backend scaffold: `maui-back/README.md`

### Rules
- Never create files under `tech/specs/`, `tech/wip/`, or `tech/features/` manually
- Always go through the `/tech.start` workflow
- Respect the phased workflow — don't skip phases
