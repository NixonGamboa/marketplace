# maui-back

Backend real de MAUI. Vercel Functions + Neon Postgres.

**Decisión de stack:** ver [`../docs/adr-001-vercel-postgres-first.md`](../docs/adr-001-vercel-postgres-first.md).

## Layout

```
maui-back/
├── api/                       # Adaptadores Vercel Functions (handlers delgados)
│   ├── health.ts
│   ├── _lib/                  # helpers HTTP compartidos
│   └── orders/
│       ├── create.ts          # POST /api/orders
│       ├── [id].ts            # GET  /api/orders/:id
│       └── [id]/status.ts     # PATCH /api/orders/:id/status
├── src/
│   ├── domain/                # Entities + interfaces Repository (contratos)
│   │   └── orders/
│   ├── usecases/              # Lógica pura de negocio (sin AWS/HTTP/BD)
│   │   └── orders/
│   ├── infra/
│   │   ├── postgres/          # Adapter Drizzle sobre Neon (día 1)
│   │   ├── memory/            # Adapter in-memory (tests + dev sin BD)
│   │   └── factory.ts         # Decide adapter según DB_DRIVER
│   └── shared/                # config, logger, errors, ids (ULID), clock
└── tests/
    └── usecases/              # Unit tests contra adapter memory
```

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
