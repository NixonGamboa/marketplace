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
                              # APP_ENV=test y destinos declarados si la BD es remota
npm run db:generate            # genera migraciones desde schema.ts
npm run db:migrate             # solo tras comprobar aislamiento; lee .env.local
```

Node requerido: `24.x` en raíz/backend. Para las Functions locales, ejecutar
`vercel dev` desde la raíz del monorepo, donde vive `api/`; no iniciar el runtime
desde `maui-back/`. Las variables del servidor deben estar disponibles en ese proceso.

`APP_ENV` indica el destino (`local/test/production`), independientemente de
`NODE_ENV`. Preview exige `APP_ENV=test` y Postgres, incluso con
`NODE_ENV=production`. Las conexiones remotas exigen `TEST_DATABASE_HOST`,
`TEST_DATABASE_NAME`, `PRODUCTION_DATABASE_HOST` y `PRODUCTION_DATABASE_NAME`
verificados; los endpoints deben ser distintos. `local` solo admite Postgres en
loopback. El cliente, migrador y Drizzle validan el destino antes de acceder a BD.
`db:generate` es offline y no requiere credenciales. No guardar secretos en Git ni
en variables `VITE_*`. El aislamiento cloud vigente se registra en el plan.

Para desarrollo sin BD:

```bash
APP_ENV=local DB_DRIVER=memory vercel dev # desde la raíz
```

Con memory, `/api/health` responde 503: este modo sirve para desarrollo/pruebas,
no acredita conectividad ni persistencia real.

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
| GET / HEAD | `/api/health` | SELECT 1 real; 200 conectado o 503 seguro |
| POST | `/api/orders` | Request compartido; devuelve `OrderConfirmationDto` |
| GET | `/api/orders/:id` | Detalle |
| PATCH | `/api/orders/:id/status` | Cambia estado (con validación de transición) |

GET/PATCH devuelven `OrderDto`; las rutas API inexistentes responden JSON 404,
incluyendo `/api` y `/api/`. Métodos no admitidos responden 405 con `Allow`.
El health ejecuta SELECT 1 con límite de cinco segundos y no publica URL/credenciales.
El build unificado todavía usa demo: su eliminación corresponde a T-23.

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

DTOs y esquemas runtime en [`../shared/contracts/`](../shared/contracts/README.md).
PWA/admin consumen tipos comunes; el backend conserva un modelo interno con
`id/customerId/storeId` y proyecta respuestas por lista blanca con validación runtime.
El DTO usa `orderId/userId/deliveryType/deliveryData`, teléfono normalizado y
`call_me/similar/remove`. La estimación conserva pesos solicitados/envío; el total
final solo puede existir cuando todos los pesos variables reales estén registrados.

La migración aditiva `0001_orders_contract_fields.sql` agrega envío/final/GPS/franja
sin borrar datos ni reescribir `total`. El mapper lee ítems/sustituciones antiguos;
`kilos` legacy se interpreta como peso solicitado, nunca real. La migración está
preparada offline y **no se ha aplicado** en esta feature. Antes de desplegar las
Functions de pedidos debe aplicarse sobre el destino de test comprobado.

T-04 no incorpora auth, catálogo servidor, idempotencia ni actualizaciones atómicas.
`userId`, nombre/precio y envío del request aún no son autoridad confiable;
GET/PATCH siguen sin autorización hasta T-05/T-06. T-10/T-12 completan esas reglas.
