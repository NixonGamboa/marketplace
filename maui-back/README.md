# maui-back

Backend real de MAUI. Vercel Functions + Neon Postgres.

## Observabilidad y recuperación de test (T-21)

Las 12 Functions añaden `X-Request-Id` y logs JSON saneados de status/latencia, pedidos
creados y replays evitados. La auditoría distingue errores de driver y contrato sin copiar
el error original. Los clientes HTTP conservan el identificador para diagnóstico.

El CLI `src/infra/recovery/main.ts` produce backup lógico AES-256-GCM y export del catálogo
público; restore con dry-run, provenance de clon Neon temporal, SHA fresca y transacción.
Dev es solo fuente y Production siempre se rechaza. Comandos, clave privada, guards,
reversión compatible y limitaciones: [operación de test](../docs/tecnicos/operacion-test.md).

## Seed de test reproducible y reset protegido (T-16)

Siembra el ambiente de test **en servidor**, por los casos de uso reales (no `runAllSeeds` del
navegador): tienda (`initializeStore`), catálogo (`seedCatalogBaseline`), cuentas
(`createStaffAccount` y `createCustomerAccount`, la variante interna del registro sin sesión ni
cota) y pedidos (`createOrder` + `updateOrderStatus`/`updateOrderItems`, con CAS, snapshots,
versiones y auditoría vigentes). Dataset `test-seed-v1`; `npm run seed:manifest` imprime su
versión, IDs y `contentHash` (cambia con cualquier edición del catálogo, tienda, cuentas o pedidos).

| Comando (`npm --prefix maui-back run …`) | Efecto |
|---|---|
| `seed:manifest` | Versión y fixtures; sin base de datos ni entorno |
| `seed:test -- --dry-run` | Solo preflight (esquema, colisiones, plan); no escribe |
| `seed:test` | Preflight + siembra idempotente |
| `reset:test` | **Dry-run** del reset de fixtures: mide y devuelve `confirmationToken` |
| `reset:test -- --execute --confirm=<token>` | Borra los fixtures medidos si nada cambió desde el dry-run |
| `reset:test -- --include-store` | Amplía el alcance a la fila de la tienda y su historial (el token lo refleja) |
| `smoke:test` | Smoke de solo lectura contra la API de test desplegada |

Los scripts leen `.env.local` (como `db:migrate`). Ejecutar siempre **después de las migraciones**:
el CLI exige que el ledger de Drizzle tenga todas las del journal (`MIGRATIONS_NOT_APPLIED`).

**Entorno.** `APP_ENV` (`local` o `test`), `DB_DRIVER=postgres`, `DATABASE_URL` y el aislamiento ya
validado por `loadConfig` (`TEST_DATABASE_HOST/NAME`, `PRODUCTION_DATABASE_HOST/NAME`). Credenciales de
las cuentas **solo por entorno o canal privado**: `SEED_OWNER_PASSWORD`, `SEED_OPERATOR_PASSWORD`,
`SEED_CUSTOMER_PASSWORD` (política de contraseña del contrato). Solo se exigen si hay cuentas por crear; no
se registran, no entran al bundle ni a la salida (que es JSON sin cadenas de conexión). Smoke:
`SMOKE_BASE_URL` (origen https limpio) y, si Preview está protegido, `SMOKE_BYPASS_TOKEN`.
`SMOKE_AUTH_ORIGIN` permite enviar el origen autorizado del frontend cuando difiere del Preview;
por defecto toma `AUTH_ORIGIN` y, en su ausencia, `SMOKE_BASE_URL`. No cambia la validación del servidor.

**Dataset.** Tienda `leche-y-miel` con los datos de `storeSeed` (contacto del negocio `null`, cobertura
urbana fijada), 9 categorías y 16 productos de `shared/catalog` con IDs estables (incluye el agotado
`jabon-bano-3pack`, no pedible), cuentas `acc_seed_owner`, `acc_seed_operator`, `acc_seed_customer_ana` y
`acc_seed_customer_luis` (emails `@seed.maui.invalid`, celulares de fixture `300 000 000x`) y 9 pedidos
`ord-seed-*` con ID, clave de idempotencia y fecha deterministas: lunes a jueves, 09:30–11:00 de Bogotá,
dentro del horario y antes del corte (se reciben atendiendo, sin aviso de procesamiento diferido).

| Pedido | Modalidad | Estado final | Cubre |
|---|---|---|---|
| `recibido-recogida` | recogida | received | peso fijo, estimado |
| `confirmado-domicilio` | domicilio | confirmed | envío cobrado |
| `preparando-peso-variable` | domicilio | preparing | peso variable pendiente (sin total final) |
| `listo-recogida-sustitucion` | recogida | ready | `call_me`, sustitución con contacto, peso real, estimado ≠ final |
| `en-camino-domicilio` | domicilio | in_delivery | peso real, final con envío |
| `entregado-domicilio-gratis` | domicilio | delivered | envío gratis por umbral |
| `entregado-recogida-peso` | recogida | delivered | peso variable real |
| `cancelado-recibido`, `cancelado-confirmado` | domicilio / recogida | cancelled | motivo y fecha |

**Idempotencia y no sobrescritura.** Tienda y catálogo se insertan solo si faltan; una cuenta existente se
verifica por identidad, rol, tienda y estado, sin elevar permisos ni resetear su contraseña (por eso un
re-seed funciona sin credenciales); los pedidos usan su claim de idempotencia. Un pedido a medias se
reanuda desde su versión; uno que el personal ya avanzó o editó queda `preserved` y no se toca. Actores
de auditoría: `system` para tienda/catálogo, el cliente al crear y las cuentas owner/operator al mutar.

**Preflight sin parcialidad.** Antes de escribir, todo conflicto aborta el seed completo con códigos
(`order_id_foreign`, `category_id_other_store`, `category_slug_taken`, `product_id_other_store`,
`account_identity_taken`, `account_mismatch`, `order_claim_mismatch`, `order_fingerprint_changed`,
`schema_missing`), sin reflejar datos de la fila ajena.

**Reset (solo fixtures, nunca la base completa).** Solo código, sin ejecución automática. Guards previos
a cualquier conexión: `APP_ENV=test` (ni `local` ni `NODE_ENV`), `DB_DRIVER=postgres` explícito,
`VERCEL_ENV` distinto de production, sin overrides ambientales (`PGHOST`, `PGDATABASE`…), `RESET_TARGET=dev/maui`
igual a la base de la conexión, endpoint fijo `ep-tiny-feather-aug4p4jh.c-10.us-east-1.aws.neon.tech`
(incluido su pooler normalizado), host/base iguales a los de test declarados y distintos de Production
(`loadConfig`), y la base que reporta el servidor (`current_database()`) igual a la declarada. El CLI solo
admite `--execute`, `--confirm`, `--include-store` (no hay forma de elegir entorno, host ni base). Borra solo
filas con ID **e** identidad/tienda del dataset (pedidos y claims, cuentas y sesiones, cuotas de pedidos,
productos, categorías e historial de esas entidades); conserva pedidos legacy, otras tiendas, la
configuración de la tienda (salvo `--include-store`) y el ledger. Una fila ajena con ID del dataset o un
producto ajeno en una categoría de fixture **bloquea** el reset. También bloquean los pedidos manuales
de clientes fixture: se conservan su cuenta y acceso a la historia. `--include-store` se rechaza si
quedan pedidos, claims, cuentas, catálogo o historial ajenos vinculados a la tienda.
La confirmación liga destino (host/base), versión del dataset, alcance y una huella SHA-256 del
contenido completo relevante. Conteos, bloqueos y huella se leen en una sola sentencia PostgreSQL;
editar contenido sin cambiar cantidades invalida el token. El batch transaccional toma bloqueos
`SHARE ROW EXCLUSIVE` sobre las tablas afectadas y vuelve a verificar la huella antes de borrar:
si el estado cambió después del preflight, aborta con `STATE_CHANGED` sin efectos parciales.
La huella es opaca; no salen filas, datos personales ni hashes de contraseña. Los bloqueos impiden
escrituras durante el reset. Restaurar = `reset:test` + `seed:test`. La rama `dev` se acredita por
el endpoint fijo del guard; declarar otro `TEST_DATABASE_HOST` no autoriza el reset.

**Smoke.** Lecturas, login y logout de las sesiones propias, sin crear pedidos: exige que `/api/health`
declare `environment: test`, y comprueba roles, alcance por cuenta, catálogo, pedidos del dataset (los
editados por el personal no se evalúan), auditoría con actor y 403 de cliente.

**Pruebas.** `tests/seed/`: PGlite con todas las migraciones y los adapters de producción (dos
siembras, huellas, ediciones preservadas, conflictos sin escritura, reproducibilidad, reset/guards/token),
CLI con la composición real y los handlers HTTP con scrypt/JWT/sesiones (roles, auth, estados, pesos,
precios, audit). El transporte PGlite ejecuta `db.batch` en orden dentro de una transacción real:
se verifican el guard antes de borrar y el rollback ante un fallo posterior. Estas pruebas no
acreditan el smoke cloud ni contención entre conexiones independientes en Neon.

## Auditoría comercial persistente (T-13)

`GET /api/audit` exige sesión vigente **owner/operator** y lista únicamente eventos de
su tienda leída de la cuenta en servidor. Customer recibe 403 y una sesión ausente,
revocada o deshabilitada 401, antes de validar filtros. No admite `storeId` ni actor
en query/body. Responde `{ items: AuditEvent[], nextCursor }`, `no-store` y `Vary: Cookie, Origin`.
Un fallo de lectura/persistencia responde 503 saneado, sin SQL ni datos personales.

Filtros opcionales: `entity` (`order/product/category/store`), `entityId`, `action`
(`created/updated/deleted/status_changed/items_changed`), `from` inclusive y `to`
exclusivo (ISO con zona, hasta milisegundos); `limit` decimal 1–100, 20 por defecto.
Parámetros repetidos/desconocidos y fechas invertidas se rechazan con 400. Orden
`createdAt DESC, id DESC`, keyset acotado en SQL; cursor canónico conserva microsegundos
y se liga a cuenta, rol, tienda y filtros. Cambiar `limit` entre páginas es válido.

Cada escritura comercial de pedidos, productos (incluido stock, archivo e imagen),
categorías y configuración de tienda inserta su evento en la misma sentencia CTE.
La creación idempotente usa `maui_commit_order_audited`: llama a la función T-10
existente y audita solo `created`, en la misma transacción PostgreSQL. Fallar el INSERT
de audit revierte cambio/claim/cuota; un CAS rechazado o replay no deja otro evento.
Los locks de sustitutos y la máquina de estados T-12 permanecen vigentes. No utiliza
transacciones interactivas, por lo que funciona con Neon HTTP.

Actor opaco de la sesión, entidad/ID, tienda, acción y fecha de PostgreSQL se guardan
en `audit_events`. Metadata tiene allowlist tipada: campos aplicados (solo nombres),
versiones, estados, importes y cambios de ítems con IDs, cantidades/pesos y constancia
de contacto. No copia nombres, teléfonos, direcciones, fotos/URLs, texto de cancelación,
cookies, secretos ni snapshots. La cancelación conserva su motivo solo en el pedido.
No hay FK a entidades/cuentas: borrar una categoría/cuenta no destruye su historia.

Los métodos internos de seed/repositorio sin actor se identifican explícitamente como
`actorKind: system`, `actorId: null`; no inventan una cuenta. La migración aditiva
`0007_audit_persistence` añade tabla, índices/CHECK y wrapper SQL, sin backfill
ni modificación de migraciones/función anteriores. Login/logout son seguridad de acceso,
fuera de esta auditoría comercial. No se añade política de retención ni UI en T-13.

Fixtures memory y PostgreSQL embebido prueban actor/tienda, replay, CAS concurrente,
fallo inyectado de INSERT audit y rollback, PII, filtros/cursor de microsegundos y lectura
HTTP con scrypt/JWT/sesiones reales. PGlite serializa conexiones: el smoke Neon/Preview
es la evidencia adicional del despliegue y concurrencia real. Esta ruta completa
**12 Vercel Functions**, sin añadir una por operación comercial.

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

**Recepción permanente (PM-03).** Los pedidos se reciben siempre: cierre por horario, día sin
atención, override `closed` y corte de domicilio ya no producen `STORE_CLOSED` ni
`DELIVERY_CUTOFF_PASSED` (códigos retirados). Solo se rechazan un domicilio deshabilitado en la
configuración (`DELIVERY_UNAVAILABLE`) y una franja incompatible con la fecha de procesamiento
(`TIME_SLOT_UNAVAILABLE`). `resolveOrderReception` (`domain/store/storeRules.ts`) calcula con el reloj
del servidor en `America/Bogota` la próxima apertura: antes de abrir es hoy; tras el cierre o en un día
sin atención, el siguiente día con atención según el horario semanal; override `closed` u horario sin
ningún día de atención dejan el aviso `unscheduled` (sin hora inventada). Un domicilio posterior al corte
con la tienda abierta se aplaza igual (`delivery_cutoff`); la recogida se procesa ya. El aviso
(`processingNotice`) forma parte del snapshot de creación: se guarda en `order_creations.snapshot`
(único por `order_id`) y los repositorios lo adjuntan al leer, así que no hay migración ni columna nueva;
la respuesta del POST, los reintentos idempotentes, el detalle y el comprobante muestran el mismo valor y
un cambio posterior del horario no lo altera. Las franjas ofrecidas son las habilitadas compatibles con la
fecha de procesamiento (sin exigir una vencida hoy); con la tienda atendiendo pero todas las franjas
habilitadas ya vencidas hoy, se ofrecen las de la próxima fecha con atención y el pedido se recibe sin
aviso (se procesa ya). `availability.timeSlotsDate` indica la fecha de las franjas; vacío significa
configuración (ninguna franja habilitada o ninguna cabe en el horario), no el horario de hoy, y el
servidor sigue aceptando una recogida sin franja. La búsqueda de esa fecha recorre el ciclo semanal: la
primera fecha con atención en que alguna franja habilitada cabe en el horario de ese día (puede ser posterior
a la próxima apertura, que sigue fijando cuándo se procesa). Con cierre manual no se inventa fecha.
**Fecha de la franja (`timeSlotDate`):** al crear una recogida con franja, el servidor fija la fecha local de
esa franja con el mismo cálculo que la ofreció y la guarda, junto al aviso y también sin migración, en el
snapshot de creación; el cliente no puede enviarla (el request es `strict`, también en `deliveryData`), no
entra en la huella de idempotencia y es independiente de `processingNotice`. Detalle, listado, comprobante
(PWA y admin) la muestran como «Franja de recogida: por la mañana · miércoles, 7 de octubre»; los pedidos
anteriores no la tienen y muestran solo la franja. En `saveChange` el aviso se toma de `next` (que
nace del pedido leído, ya con el aviso inmutable) en vez de releerlo tras el UPDATE: un fallo de lectura
no puede reportar error por un cambio ya persistido. GET/listado sí leen `order_creations` y fallan
con 503 si esa lectura falla (lectura sin efectos). La verificación contra Neon/Preview real queda
pendiente: las pruebas PGlite ejecutan el SQL real en una conexión.

Migración aditiva `0004_order_creation_idempotency`: claim/snapshot persistente y
función SQL con privilegios del llamador; un lock transaccional por identidad y
locks de lectura/versiones garantizan coherencia del catálogo/tienda al confirmar.
Claim, pedido y reserva de 20/hora se confirman juntos, con rollback ante fallo.
No hay stock numérico ni descuento: se validan activo, no archivado y disponible.
Las pruebas PGlite ejecutan SQL real en una conexión; concurrencia multiinstancia
en Neon/Preview y revisión del otro proveedor son necesarias para cerrar T-10.

## Listado histórico de pedidos (T-11)

`GET /api/orders` lista pedidos con sesión vigente; es lectura, así que no exige `Origin`
(sí lo exigen POST/PATCH). El alcance sale de la cuenta leída de BD en cada request, nunca
de la query ni del body: **customer** ve solo sus pedidos (de cualquier tienda);
**owner/operator** ven solo los de su tienda. Un rol/cuenta sin alcance responde 403, una
sesión inválida o revocada 401 (antes de validar la query) y un fallo de persistencia 503
genérico (sin SQL ni parámetros). Respuesta `no-store` con `Vary: Cookie, Origin`.

Respuesta: `{ "items": OrderDto[], "nextCursor": string | null }`. Cada ítem sale por el
mismo mapper (`toOrderDto`) que el detalle, sin `storeId`. Si una fila persistida no cumple
el DTO, la página responde 500 (igual que el detalle), no datos malformados.

| Parámetro | Regla |
|---|---|
| `q` | Texto literal 1–64 caracteres, sin control ni sustitutos sueltos. Coincide con el **inicio del ID**, un **fragmento del nombre** o, si parece teléfono (≥ 3 dígitos), un **fragmento de sus dígitos**. Sin distinguir mayúsculas (según la collation de la BD). `%`, `_` y `\` no son comodines: se evalúa con `strpos`, no con LIKE |
| `status` | Uno de los estados de pedido |
| `from` / `to` | ISO 8601 con zona (`Z` u offset `±HH:MM`; `+` va como `%2B`), hasta milisegundos, entre 2000-01-01Z y 3000-01-01Z. Filtran `createdAt`: `from` **inclusivo**, `to` **exclusivo**; `from` < `to` |
| `limit` | Entero decimal 1–100 (20 por defecto); sin coerciones (`10abc`, `1e1`, `0x10` → 400) |
| `cursor` | Opaco, el `nextCursor` anterior |

Parámetros desconocidos o repetidos → 400 `VALIDATION_ERROR` con `issues` sin reflejar el valor.

Orden `createdAt DESC, id DESC` con paginación **keyset** en SQL (`limit + 1`, sin COUNT ni
carga de la tabla): alcance, filtros y búsqueda se aplican en la consulta. El cursor lleva la
posición a **microsegundos** (la fecha se calcula en PostgreSQL con `to_char`, no se redondea a
milisegundos, que perdería filas del mismo milisegundo) y un hash de actor, rol, alcance y
filtros: reutilizarlo con otros filtros, cuenta, rol o tienda → 400 `cursor` inválido. Cambiar
`limit` entre páginas sí es válido. La última página trae `nextCursor: null`.

El cursor no es secreto ni autoriza: solo impide mezclar consultas. Migración aditiva
`0005_orders_listing_indexes`: índices `(store_id, created_at DESC, id DESC)` y
`(customer_id, …)` para el alcance y el orden sin ordenar aparte (el listado de cliente no tenía
índice por `customer_id`); la consulta usa `DESC NULLS LAST` para coincidir con ellos.
`listByStore` se conserva (solo tests lo consumen) como atajo de `listPage`; su antiguo
`cursor` solo por fecha se eliminó por no tener consumidores. Las apps aún usan servicios mock:
T-17/T-18 deben consumir este contrato y T-19 el polling.

## Ciclo de estados, pesos y sustituciones (T-12)

Solo **owner/operator** de la tienda del pedido mutan pedidos; el cliente (incluso dueño)
recibe 403 antes de validar el body o leer el pedido, y otra tienda responde el mismo 404
que un ID inexistente. Rol y tienda salen de la cuenta leída de BD en cada request; el body
nunca aporta actor, tienda, precios ni importes (esquemas `.strict()`). Ambas rutas exigen
`Origin` y JSON, y responden el `OrderDto` actualizado.

| Ruta | Body | Regla |
|---|---|---|
| `PATCH /api/orders/:id/status` | `{ status, expectedVersion, reason? }` | Máquina común por modalidad (`in_delivery` solo en domicilio, cancelar hasta `ready`). Entrar en `ready`, `in_delivery` o `delivered` exige todos los pesos reales y fija `finalTotal`. `cancelled` exige `reason` (5–500 caracteres, recortado) y guarda motivo y fecha |
| `PATCH /api/orders/:id` | `{ expectedVersion, changes: [...] }` | Solo en `preparing`, en bloque y todo o nada: `weight` (`itemId`, `kilosReal` 0,001–100 kg en gramos, solo peso variable), `remove` (`itemId`, `customerContacted?`) y `substitute` (`itemId`, `productId`, `qty`, `kilosRequested?`, `kilosReal?`, `customerContacted?`) |

- **Versión optimista:** `version` nace en 1 (también en filas previas) y sube con cada cambio.
  Una `expectedVersion` vieja o una escritura concurrente que gana entre lectura y escritura
  responden 409 `ORDER_VERSION_CONFLICT`: se recarga el pedido y se reintenta. El adapter
  PostgreSQL usa **un solo UPDATE condicional** (`id`, tienda, versión y estado leídos),
  compatible con Neon HTTP y varias instancias; dos cambios simultáneos no se pisan ni
  producen doble transición. El adapter memory compara y escribe sin `await` intermedio.
- **Terminales inmutables:** `delivered` y `cancelled` rechazan cualquier transición o cambio
  de ítems (400). Cancelaciones previas a T-12 quedan sin motivo/fecha y siguen siendo válidas.
- **Totales:** `estimatedTotal`, `shippingCost` y el snapshot de idempotencia no cambian.
  `finalTotal` se recalcula con los ítems vigentes (redondeo por línea en gramos, ADR-006) y
  el envío cotizado al pedir, que nunca se recotiza; falta mientras haya un peso real pendiente
  y existe siempre desde `ready` (peso fijo o variable). Cada paso a `ready`, `in_delivery` o
  `delivered` lo recalcula: un pedido legacy que llegó a `ready`/`in_delivery` sin total lo
  obtiene al avanzar y, si le falta un peso real, no avanza (400); nunca queda `delivered` sin
  total. Pedidos legacy sin envío guardado suman solo ítems. Pesos: solo los límites técnicos
  del contrato (0,001–100 kg en gramos), sin tolerancia respecto al peso pedido.
- **Sustitución:** producto de la misma tienda, activo, no archivado y con stock, que no esté ya
  en el pedido; nombre, unidad, precio vigente del catálogo servidor y peso variable salen del
  catálogo. La misma sentencia que escribe el pedido **bloquea con `FOR SHARE`** (orden por ID)
  las filas de los sustitutos y exige su versión leída, tienda y disponibilidad: un cambio de
  catálogo concurrente espera o hace fallar la escritura (409); nunca se confirma un snapshot
  obsoleto. Los bloqueos duran solo esa sentencia. La línea lleva `substitutedFor` (producto
  pedido originalmente). El pedido no puede quedar vacío (el DTO exige al menos un ítem): se
  cancela con motivo.
- **Preferencias del cliente:** `remove` solo permite quitar, nunca sustituir. `call_me` exige
  que el personal declare el contacto previo (`customerContacted: true`) para quitar o
  sustituir; pesar no lo requiere. Es una declaración del operador autenticado: el servidor no
  la verifica, no envía mensajes y no equivale a una confirmación del cliente. `similar`
  permite sustituir o quitar.
- **Snapshots:** la primera sustitución o retiro fija `originalItems` (ítems pedidos, sin pesos
  reales); los pesos solos no lo crean.
- **Trazabilidad:** cada cambio guarda `updated_by` (cuenta del personal, no expuesta en el DTO),
  `updated_at` (no retrocede) y la versión; la cancelación guarda motivo y `cancelled_at`. Cada
  retiro o sustitución queda en `item_adjustments` (tipo, ítem, sustituto, constancia de
  contacto, actor y fecha; interno, no sale en el DTO) para que T-13 lo audite. La bitácora
  persistente de todos los cambios es T-13.

Migración aditiva `0006_orders_state_cycle`: columnas `version` (default 1), `updated_by`,
`original_items`, `item_adjustments`, `cancellation_reason` y `cancelled_at`, más CHECK de versión positiva y de
motivo+fecha solo en pedidos cancelados. No reescribe filas ni la función de creación.
Una fila legacy se reescribe en formato canónico al primer cambio de ítems. Un pedido legacy
de peso variable que ya estaba en `in_delivery` sin peso real no puede entregarse ni cancelarse
(los ítems solo se editan en `preparing`): requiere corrección de datos fuera de la API.

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
│       ├── index.ts           # → GET (listado) y POST /api/orders
│       ├── [id].ts            # → GET y PATCH (ítems) /api/orders/:id
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
| GET | `/api/orders` | Listado paginado: cliente → sus pedidos; owner/operator → su tienda. Devuelve `{items, nextCursor}` |
| POST | `/api/orders` | Solo customer; dueño = cuenta de la sesión, tienda fijada por servidor. Devuelve `OrderConfirmationDto` |
| GET | `/api/orders/:id` | Cliente dueño u owner/operator de la tienda del pedido |
| PATCH | `/api/orders/:id` | Owner/operator de la tienda del pedido: pesos reales, sustitución y retiro en `preparing` (T-12) |
| PATCH | `/api/orders/:id/status` | Owner/operator de la tienda del pedido: transición con `expectedVersion`; cancelar exige `reason` (T-12) |

Los pedidos exigen cookie de sesión vigente (401 si falta, expiró, fue revocada o la
cuenta está deshabilitada). Un pedido de otro cliente u otra tienda responde el mismo
404 que uno inexistente; un rol sin permiso, 403. `userId` del request debe coincidir
con la sesión (si no, 403) y `storeId`/`customerId` se rechazan. POST/PATCH exigen
`Origin` igual a `AUTH_ORIGIN` y JSON; las respuestas son `no-store`. Crear pedidos
tiene límite persistente de 20 por cuenta y hora (429 con `Retry-After`). El listado
(T-11) reutiliza `domain/orders/orderAccess`; ver su sección arriba.

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
recepción/procesamiento/franja/envío para T-10, que debe pasarle el subtotal calculado
con el catálogo del servidor. Sin tienda inicializada, `/api/store` responde 404 y el
catálogo público queda vacío: `initializeStore` y `seedCatalogBaseline` son el seed
idempotente de servidor para T-16 (no sobrescriben ediciones).

La migración aditiva `0003_catalog_store_settings.sql` crea `stores`,
`catalog_categories` y `catalog_products` sin tocar tablas previas. Se generó offline,
se probó en PostgreSQL embebido y se aplicó solo a Neon dev/maui (ledger 4, pedido
previo conservado); el smoke real en Preview pasó. La BD de test sigue sin tienda ni
catálogo sembrados hasta T-16: `/api/store` responde 404 y `/api/catalog` vacío.
Evidencia en el plan.

GET/PATCH de pedidos devuelven `OrderDto` (el listado, `OrderDto[]` paginado); las rutas API inexistentes responden JSON 404,
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
T-10 toma catálogo y envío del servidor y garantiza la creación idempotente;
T-12 completa estados, pesos y sustituciones con escritura condicional por versión (ver su
sección). T-06 aplica autorización por cliente/tienda.

La creación conserva un snapshot original con nombre, teléfono y domicilio. Borrar
un pedido elimina su claim por cascada; una anonimización mediante UPDATE no cambia
el snapshot. Una política posterior de privacidad/retención debe abarcar ambas tablas.

## Imágenes de catálogo (T-09)

`POST /api/catalog/products/:id/image?version=N` recibe JSON `{ imageBase64 }`.
Requiere sesión `owner` de la tienda del producto y `Origin` de la aplicación. La
versión debe coincidir con el catálogo staff; esa respuesta ahora incluye `version`.
El catálogo público conserva su contrato.

Se admiten JPEG, PNG y WebP estáticos de hasta 3 MiB, comprobados por firma y
decodificación real. Sharp limita píxeles/dimensiones, aplica orientación y retira
metadatos, incluido EXIF/GPS. La salida es WebP de hasta 1600 px y 1 MiB. SVG,
animaciones, archivos corruptos y cuerpos fuera del límite se rechazan. El JSON
base64 permanece bajo el máximo de 4.5 MB de Vercel Functions.

Los puertos `ProductImageStorage` y `ProductImageProcessor` separan el caso de uso
del proveedor. Vercel Blob guarda imágenes comerciales públicas en rutas nuevas
generadas por el servidor. El token nunca llega al navegador. Las cuatro variables
`BLOB_STORE_ID`, `TEST_BLOB_STORE_ID`, `TEST_BLOB_PUBLIC_HOST` y
`BLOB_READ_WRITE_TOKEN` pertenecen exclusivamente a Preview/develop; los guards
rechazan Production y ramas productivas. Esta configuración es solo de test.

La asociación a Postgres usa la versión esperada (CAS). Un rechazo definitivo
retira únicamente el blob recién creado por esa petición. Un fallo SQL de resultado
incierto conserva el blob para reconciliación, evitando borrar una referencia que
podría confirmar después del timeout. Reemplazar una foto conserva las anteriores;
la retención/recolección de huérfanos necesita una política posterior.

Las reservas persistentes limitan a 30 intentos por cuenta/hora y 100 por tienda/día;
las entradas inválidas que requieren procesamiento consumen cupo. Se deniegan rol,
tienda y versión antes de leer la imagen. El admin incorpora selector de archivo y
cámara y servicio HTTP real; su activación con sesión/catálogo reales corresponde a
T-17. Elegir o cancelar una foto no la sube: se envía al guardar.
