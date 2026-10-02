# maui-back

Backend real de MAUI. Vercel Functions + Neon Postgres.

## Creación de pedidos (T-10)

`POST /api/orders` requiere sesión customer, Origin permitido e `Idempotency-Key` de
16–128 caracteres (`A-Z`, `a-z`, dígitos y `._:-`). Conservar la clave y la intención
del pedido ante timeout/reintento. Misma cuenta/tienda/clave e intención normalizada:
misma confirmación original (201), sin otro pedido ni cupo; intención distinta: 409
`IDEMPOTENCY_KEY_REUSED`. La sesión sigue validándose en cada petición.

Los ítems solicitan producto, cantidad y kilos. Nombre, precio, unidad y peso variable
son snapshots del catálogo; envío y gratuidad se calculan con la tienda. Campos legacy
`priceAtMoment`, `name`, `is_variable_weight` y `shippingCost` son opcionales, ignorados
y excluidos de la huella. Su forma sigue validada. `userId` sigue requerido y debe
coincidir con la sesión; no autoriza. La PWA real añadirá la clave en T-18.

Migración aditiva `0004_order_creation_idempotency`: claim/snapshot persistente y
función SQL con privilegios del llamador; un lock transaccional por identidad y
locks de lectura/versiones garantizan coherencia del catálogo/tienda al confirmar.
Claim, pedido y reserva de 20/hora se confirman juntos, con rollback ante fallo.
No hay stock numérico ni descuento: se validan activo, no archivado y disponible.
Las pruebas PGlite ejecutan SQL real en una conexión; concurrencia multiinstancia
en Neon/Preview y revisión del otro proveedor son necesarias para cerrar T-10.

**Decisión de stack:** ver [`../docs/tecnicos/adr-001-stack-backend.md`](../docs/tecnicos/adr-001-stack-backend.md).

## Layout

```
/ (raíz del monorepo)
├── api/                       # Adaptadores Vercel Functions (handlers delgados)
│   ├── health.ts              # → GET  /api/health
│   ├── _lib/                  # helpers HTTP compartidos
│   ├── auth/                  # registro cliente, login, sesión y logout
│   ├── catalog.ts             # → /api/catalog/* (una Function, dispatch por ?op=)
│   ├── store.ts               # → /api/store, /api/store/staff
│   └── orders/
│       ├── index.ts           # → POST /api/orders
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

## Acceso y sesiones

La base de T-05 añade `POST /api/auth/register`, `POST /api/auth/login`,
`GET /api/auth/session` y `POST /api/auth/logout`, con cookie HttpOnly y
sesiones revocables en Postgres. Configuración, contrato y límites están en
[`ADR-002`](../docs/tecnicos/adr-002-acceso-sesiones.md) y
`../shared/contracts/auth.ts`. Registro solo crea customer; staff se provisiona
desde servidor. No hay envío ni verificación WhatsApp.

Configurar `AUTH_JWT_SECRET` y `AUTH_ORIGIN` en el servidor. El origen es exacto
y HTTPS fuera de local; el secreto no tiene fallback. Auth valida su configuración
al usarla y responde 503 si falta. Health sigue disponible independientemente.
Login recibe `{method: "phone", phone, password}` o
`{method: "email", email, password}`; registro `{name, phone, password}`.
Mutaciones exigen la cabecera Origin configurada; login/registro también JSON.
Los DTO no contienen token ni hash. Logout revoca y elimina cookie.

**Pedidos (T-06):** los tres endpoints exigen esta sesión; actor, rol y tienda salen
de la cuenta vigente, nunca del body ni de cabeceras. Detalles en la tabla de
endpoints. PWA/admin todavía usan auth demo hasta T-17/T-18.
La migración 0002 se aplicó solo a Neon dev/maui tras aprobar C2 y verificar
destino/ledger; 19 checks auth reales en Preview develop pasan. Tres cuentas
temporales y sus sesiones se retiraron; pedidos conservados. Evidencia en el plan.

## Validación reproducible

Desde la raíz: `npm run ci:install`, `npm run ci:check`, `npm run ci:build`.
CI usa Node 24.x, cuatro lockfiles, typecheck explícito app/node de ambos fronts,
lint frontend, drift de contratos y las tres suites antes del build unificado.
Las pruebas memory y PostgreSQL embebido son fixtures aislados sin secretos cloud;
no sustituyen el smoke real Neon/Preview. El build unificado aún compila demo.

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
| POST | `/api/orders` | Solo customer; dueño = cuenta de la sesión, tienda fijada por servidor. Devuelve `OrderConfirmationDto` |
| GET | `/api/orders/:id` | Cliente dueño u owner/operator de la tienda del pedido |
| PATCH | `/api/orders/:id/status` | Owner/operator de la tienda del pedido (con validación de transición) |

Los pedidos exigen cookie de sesión vigente (401 si falta, expiró, fue revocada o la
cuenta está deshabilitada). Un pedido de otro cliente u otra tienda responde el mismo
404 que uno inexistente; un rol sin permiso, 403. `userId` del request debe coincidir
con la sesión (si no, 403) y `storeId`/`customerId` se rechazan. POST/PATCH exigen
`Origin` igual a `AUTH_ORIGIN` y JSON; las respuestas son `no-store`. Crear pedidos
tiene límite persistente de 20 por cuenta y hora (429 con `Retry-After`). No hay
endpoint de listado: T-11 lo añadirá reutilizando `domain/orders/orderAccess`.

### Catálogo y tienda (T-07/T-08)

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/catalog` | Público: categorías y productos activos no archivados de la tienda fijada por el servidor |
| GET | `/api/catalog/products/:id` | Público; oculto, archivado o inexistente responden el mismo 404 |
| GET | `/api/catalog/staff` | Owner/operator: todo el catálogo de su tienda, con `active`/`archived` |
| POST | `/api/catalog/products` | Owner; ID asignado por el servidor (201 `StaffProductDto`) |
| PATCH | `/api/catalog/products/:id` | Owner; incluye agotado, publicación y archivo/restauración |
| POST | `/api/catalog/categories` | Owner; slug único por tienda |
| PATCH / DELETE | `/api/catalog/categories/:id` | Owner; DELETE con productos (incluso archivados) → 409 `CATEGORY_IN_USE` |
| GET | `/api/store` | Público: configuración y `availability` calculada en America/Bogota |
| GET / PATCH | `/api/store/staff` | GET owner/operator de su tienda; PATCH solo owner |

Solo dos Functions nuevas (11 en total): `vercel.json` reescribe cada ruta a
`/api/catalog?op=…&id=…` o `/api/store?op=staff` antes del catch-all; una operación
desconocida o repetida responde el 404 JSON común. Permisos según el admin vigente:
catálogo, categorías, tienda y configuración son pantallas `owner`; el operador solo
lee. Tienda y actor salen de la cuenta de la sesión; el body los rechaza (strict) y
otra tienda responde 404. Mutaciones exigen `Origin` exacto y JSON ≤ 16 KiB.

Productos: `active`, `inStock` y archivo son independientes; no hay borrado, el archivo
conserva ID y pedidos históricos. FK compuesta `(store_id, category_id)` con RESTRICT
impide usar categorías de otra tienda y borrar una categoría usada en la misma
sentencia (PostgreSQL reporta `23001`/`23503`); CHECK repiten COP, precio/kg y unidad.
Ediciones condicionadas por `version` (409 ante concurrencia). Tienda: horario semanal,
override, corte de domicilio, franjas, envío/umbral y nota de cobertura; sin geocerca
ni geocodificación. `usecases/store/evaluateOrderFulfillment` deja listas las reglas de
cierre/corte/franja/envío para T-10, que debe pasarle el subtotal calculado con el
catálogo del servidor. Sin tienda inicializada, `/api/store` responde 404 y el
catálogo público queda vacío: `initializeStore` y `seedCatalogBaseline` son el seed
idempotente de servidor para T-16 (no sobrescriben ediciones).

La migración aditiva `0003_catalog_store_settings.sql` crea `stores`,
`catalog_categories` y `catalog_products` sin tocar tablas previas. Se generó offline,
se probó en PostgreSQL embebido y se aplicó solo a Neon dev/maui (ledger 4, pedido
previo conservado); el smoke real en Preview pasó. La BD de test sigue sin tienda ni
catálogo sembrados hasta T-16: `/api/store` responde 404 y `/api/catalog` vacío.
Evidencia en el plan.

GET/PATCH de pedidos devuelven `OrderDto`; las rutas API inexistentes responden JSON 404,
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
`kilos` legacy se interpreta como peso solicitado, nunca real. La migración fue
aplicada y comprobada en Neon dev/maui durante C1 el 2026-10-01, conservando el
pedido previo; la evidencia está en el plan. Las migraciones nuevas requieren
verificar destino/ledger y su autorización propia antes de ejecutar.

T-04 no incorpora auth, catálogo servidor, idempotencia ni actualizaciones atómicas
(catálogo y tienda llegan en T-07/T-08; su uso en pedidos es T-10).
Nombre/precio y envío del request aún no son autoridad confiable; T-10/T-12
completan esas reglas. La autorización por cliente/tienda corresponde a T-06.
