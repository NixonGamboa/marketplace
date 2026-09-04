# maui-back

Backend real de MAUI. Vercel Functions + Neon Postgres.

**Decisión de stack:** ver [`../docs/tecnicos/adr-001-stack-backend.md`](../docs/tecnicos/adr-001-stack-backend.md).

## Layout

```
/ (raíz del monorepo)
├── api/                       # Adaptadores Vercel Functions (handlers delgados)
│   ├── health.ts              # → GET  /api/health
│   ├── _lib/                  # helpers HTTP compartidos
│   └── orders/
│       ├── create.ts          # → POST /api/orders
│       ├── [id].ts            # → GET  /api/orders/:id
│       └── [id]/status.ts     # → PATCH /api/orders/:id/status
└── maui-back/
    ├── src/
    │   ├── domain/            # Entities + interfaces Repository (contratos)
    │   │   └── orders/
    │   ├── usecases/          # Lógica pura de negocio (sin AWS/HTTP/BD)
    │   │   └── orders/
    │   ├── infra/
    │   │   ├── postgres/      # Adapter Drizzle sobre Neon (día 1)
    │   │   ├── memory/        # Adapter in-memory (tests + dev sin BD)
    │   │   └── factory.ts     # Decide adapter según DB_DRIVER
    │   └── shared/            # config, logger, errors, ids (ULID), clock
    └── tests/
        └── usecases/          # Unit tests contra adapter memory
```

**Por qué `api/` vive en la raíz:** Vercel busca la carpeta `api/` en el Root Directory
del proyecto y expone cada archivo como Function serverless en el mismo host que
el frontend (PWA en `/`, admin en `/admin/`, API en `/api/*`). Esto elimina CORS y
permite auth con cookies mismo-origen. Los handlers importan la lógica desde
`../maui-back/src/*` con paths relativos — sin ceremonia.

**Regla dura:** los `api/*` no tienen lógica. Los `usecases/*` no conocen HTTP ni BD.
Los `infra/*` implementan interfaces del `domain/`. Cambiar de Postgres a DynamoDB
o de Vercel a AWS Lambda = agregar un adapter + swap del factory.

## Setup

```bash
cd maui-back
npm install
cp .env.example .env.local     # completar DATABASE_URL con tu Neon
npm run db:generate            # genera migraciones desde schema.ts
npm run db:migrate             # aplica migraciones en Neon
npm run dev                    # arranca vercel dev en http://localhost:3000
```

Para desarrollo sin BD:

```bash
DB_DRIVER=memory npm run dev
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | `vercel dev` con las funciones en `api/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Corre unit tests con `vitest` (adapter memory) |
| `npm run test:watch` | Vitest en modo watch |
| `npm run db:generate` | Genera migraciones SQL desde `schema.ts` |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:studio` | UI de Drizzle Studio |

## Endpoints (referencia)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/orders` | Crea pedido |
| GET | `/api/orders/:id` | Detalle |
| PATCH | `/api/orders/:id/status` | Cambia estado (con validación de transición) |

## Cambios de schema (migraciones)

Ciclo básico:

1. Editar `src/infra/postgres/schema.ts`.
2. `npm run db:generate` → nuevo archivo `.sql` numerado en `src/infra/postgres/migrations/`.
3. `npm run db:migrate` → aplica y registra en `drizzle.__drizzle_migrations`.
4. Commitear el `.sql` (es historia versionada del schema, no un artefacto).

### Antes de tener datos reales

Iterá sin ceremonia. Si algo se rompe:

```sql
-- Reset total (destruye todo — solo pre-prod)
DROP SCHEMA public CASCADE;
DROP SCHEMA drizzle CASCADE;
CREATE SCHEMA public;
```

Luego `npm run db:migrate` recrea todo desde cero.

### Con datos reales (post-swap del frontend)

| Tipo de cambio | Seguridad | Cómo |
|---|---|---|
| Aditivo: nueva columna nullable, nueva tabla, nuevo índice | Safe | `generate` + `migrate` directo |
| Renombrar columna, cambiar tipo | Riesgoso | Multi-paso: agregar nueva columna → backfill → swap código → drop vieja |
| Destructivo: drop columna/tabla | Riesgoso | Feature flag + doble escritura, drop en release posterior |

**Regla operativa:** para cambios no-aditivos, usar Neon *branches* antes de tocar `main`:

```bash
# En Neon (via MCP o console):
# 1. Crear branch desde main → obtenes DATABASE_URL del branch
# 2. Apuntar .env al branch temporalmente
# 3. npm run db:migrate  (aplica en el branch, no en main)
# 4. Probar la app contra el branch
# 5. Si OK → promover/mergear branch a main
# 6. Si falla → borrar el branch, nada afectado
```

Los branches de Neon copian datos point-in-time en segundos y no cuestan compute mientras están inactivos.

### Rollback

Drizzle **no** genera down-migrations. Opciones:

- **Revertir código + escribir migración inversa a mano** (siempre viable).
- **Neon time travel / restore** al estado previo al `migrate`.
- **Snapshot manual** antes de migraciones grandes (`create_snapshot` via MCP o console).

## Migración futura a AWS Lambda + DynamoDB

Ver ADR §4. En resumen:

1. Escribir `src/infra/dynamodb/OrdersRepositoryDynamo.ts` implementando `OrdersRepository`.
2. Extender `factory.ts` para instanciar Dynamo cuando `DB_DRIVER=dynamodb`.
3. Reemplazar `api/` por `handlers-lambda/` con `template.yaml` (SAM) o CDK.
4. Los `usecases/` y tests **no se tocan**.

## Contratos con el frontend

Los tipos de `src/domain/orders/Order.ts` deberían moverse a `../shared/` cuando
se acuerde con el frontend cómo consumirlos (import compartido vs generación
desde OpenAPI). Por ahora viven en el backend como source of truth.
