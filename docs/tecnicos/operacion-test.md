# Operación técnica de test (T-21)

## Diagnóstico y métricas

Cada respuesta de las 12 Functions incluye `X-Request-Id`. Se acepta un único ID ASCII de
8–64 caracteres (`A-Z`, `a-z`, dígitos, `._:-`), con primer carácter alfanumérico; uno
ausente, repetido o inválido se reemplaza por UUID. No cambia el envelope de los contratos.
El cliente HTTP genera un ID por intento y conserva el confirmado por API en `ApiError.requestId`,
incluidos errores de contrato, timeout y red. Una consulta del log por ese ID conecta el fallo
del navegador con la petición del servidor; si la petición no llegó, solo existe el evento del cliente.

`api_request` registra exclusivamente ruta estática del handler, método permitido, status,
duración en milisegundos, requestId, indicador de error y contadores `orderCreated` y
`orderReplayed`. El POST de pedidos mide el resultado idempotente del caso de uso: también el
replay concurrente o recuperado tras pérdida de respuesta. No mide un 409 como pedido creado.
Un fallo de auditoría incluye solo `auditFailure: driver|contract` (T-13/F2), conservando
el 503 público. No se registran cuerpos, IDs de negocio, query, clientes, teléfonos, cookies,
JWT, SQL, URL de conexión, stack ni error original. AsyncLocalStorage separa la metadata
entre peticiones concurrentes; el caso de uso de pedidos recibe un observador explícito sin datos.

En Vercel Logs del Preview identificado por SHA/ref se filtra `event=api_request` y un
intervalo uniforme. Sumar `orderCreated` da pedidos confirmados; sumar `orderReplayed` da
reintentos duplicados evitados. Promedio/p95 de `durationMs` por endpoint/método mide latencia;
status ≥500 dividido por peticiones mide fallos de servicio, mientras status 400–499 identifica
rechazos del cliente. El dashboard admin protegido conserva conteos por estado, ticket promedio
de entregados y alertas del día de Bogotá a partir de API real. Los logs técnicos están restringidos
a quienes tengan acceso al proyecto Vercel: no se agrega endpoint público de métricas, SDK ni servicio.
Conservar `LOG_LEVEL=info` (default) para medir todos los requests: `warn` limita los eventos
a status ≥400 y `error` a status ≥500, por lo que esos niveles no sirven como denominador de métricas.

El cliente emite `client_api_error` saneado (cliente, endpoint con IDs sustituidos, método,
kind, status, requestId y duración). Cancelaciones voluntarias no generan ruido. El callback
`onError` permite inspección controlada y el default escribe JSON en consola; un fallo del
callback no cambia el resultado de la petición. No se envían logs del navegador a un servicio
nuevo. La aplicación PWA debe incorporar el mismo cambio después de T-20; esa integración
y el smoke de Preview son parte de la evidencia pendiente del bloque.

## Backup cifrado y catálogo público

CLI portable en `maui-back/src/infra/recovery/main.ts`, ejecutado con el `tsx` existente,
desde `maui-back`. Variables privadas: `APP_ENV=test`, `DB_DRIVER=postgres`, `DATABASE_URL`
y `BACKUP_ENCRYPTION_KEY` (32 bytes aleatorios codificados como 64 dígitos hexadecimales).
Generar una clave independiente por entorno; nunca reutilizar JWT ni poner la clave en argumentos,
stdout, documentos, Git, archivos del deployment o junto al backup. `VERCEL_ENV=production`
y overrides `PGHOST/PGDATABASE/PGUSER/…` bloquean el CLI. En Windows proteger los archivos
con ACL del usuario: `mode 0600` no sustituye las ACL. Usar directorio privado fuera del repo.

```text
node node_modules/tsx/dist/cli.mjs src/infra/recovery/main.ts backup --file=<archivo-privado-nuevo>
node node_modules/tsx/dist/cli.mjs src/infra/recovery/main.ts export-catalog --file=<archivo-nuevo>
```

Fuente fija: proyecto `rough-morning-66975813`, rama dev `br-rough-mud-au9ohq6s`, base `maui`,
endpoint `ep-tiny-feather-aug4p4jh.c-10.us-east-1.aws.neon.tech` (también pooler normalizado).
Backup y export nunca escriben en dev. El export reutiliza casos de uso y mappers del catálogo
público: activos y no archivados, sin cuentas ni campos privados. Es JSON utilizable fuera de MAUI.

El backup lógico recoge en una sentencia consistente las nueve tablas `stores`,
`catalog_categories`, `catalog_products`, `auth_accounts`, `auth_sessions`, `auth_rate_limits`,
`orders`, `order_creations`, `audit_events`, columnas/tipos, CHECK/FK, índices, funciones MAUI
y ledger Drizzle. Incluye sesiones y hashes de contraseña: el archivo es privado aun cifrado.
AES-256-GCM con nonce aleatorio y AAD versionado autentica el contenido; SHA-256 canónico permite
comparar integridad sin mostrar filas. El ledger debe coincidir con hashes LF y fechas de las
migraciones del checkout. Salida limitada a estado, códigos, conteos y huellas opacas.
No depende de `pg_dump`; no exporta SQL ejecutable y nunca interpola tablas del archivo.
Las imágenes Blob no se descargan: se conservan sus referencias; su recuperación independiente
queda fuera de este backup de Postgres.

## Prueba de recuperación aislada

Solo el orquestador crea **una rama temporal Neon desde dev**, obtiene su identidad real desde
API y guarda provenance privado. El archivo estricto contiene:

```text
version: 1
projectId: rough-morning-66975813
parentBranchId: br-rough-mud-au9ohq6s
branchId, endpointId, host: identidad real del clon temporal
database: maui
temporary: true
createdAt, expiresAt: ISO UTC; vigencia máxima 24 horas
evidence: { projectId, branch: { id, parent_id }, endpoint: { id, branch_id, host } }
```

La evidencia es extraída de API Neon por el orquestador autorizado; el CLI no autentica Neon ni
convierte un archivo escrito por terceros en permiso cloud. Verifica coincidencia de proyecto,
parent dev, IDs de branch/endpoint, host y conexión, vigencia y base real que reporta PostgreSQL.
Rechaza dev como destino, Production (`br-patient-mouse-au2580c5` y endpoint
`ep-weathered-salad-auk9jj3u…`), cualquier destino sin prueba o con mismatch. La connection URL
del restore debe apuntar al clon y se mantiene privada. Nunca ejecutar reset permanente de T-16
para simular una restauración completa.

1. Crear backup desde dev y registrar solo su huella; guardar clave independiente fuera del repo.
2. Crear el clon desde dev y provenance; añadir un sentinel únicamente en ese clon.
3. Apuntar `DATABASE_URL` al clon y ejecutar el dry-run. El plan debe ser un archivo nuevo.
4. Ejecutar en cinco minutos con la SHA recibida; comprobar que la huella final coincide con backup.
5. Verificar las relaciones/datos por consultas privadas sin imprimir filas. Borrar el clon desde
   Neon con la autorización vigente y confirmar la ausencia por API. Registrar IDs y huellas.

```text
node node_modules/tsx/dist/cli.mjs src/infra/recovery/main.ts restore --file=<backup> --guard=<provenance> --plan=<plan-nuevo>
node node_modules/tsx/dist/cli.mjs src/infra/recovery/main.ts restore --file=<backup> --guard=<provenance> --plan=<plan> --execute=true --confirm=<confirmationSha>
```

El dry-run descifra, valida forma/tipos/lista fija, ledger y esquema del destino; no cambia filas.
La confirmación SHA liga backup, huella de todas las filas previas, provenance, destino y caducidad.
Si cambia cualquier fila hay que generar otro plan. El execute repite la prueba y entra en una
transacción Neon HTTP: lock de nueve tablas y ledger, guard de estado, TRUNCATE del allowlist
sin CASCADE, INSERT tipado en orden de FK y comparación completa del snapshot restaurado.
Un mismatch, FK/CHECK o fallo de INSERT revierte toda la transacción. Verifica de nuevo la huella
después del commit. No modifica DDL, ledger, permisos ni funciones del esquema.

## Reversión de versión

Elegir un SHA anterior verificado con schema/contratos compatibles y Preview de test.
Comparar journal/ledger y migraciones añadidas antes de revertir el código; una versión que
necesita eliminar columnas, tablas o datos no es compatible. No ejecutar migraciones down
automáticas ni restaurar dev/Production con este CLI. Si existe drift o ledger distinto,
el restore falla antes de cambiar datos. Promover master/Production exige autorización separada.
## Evidencia y límites

Pruebas locales comprueban cifrado/alteración, guards, caducidad, esquema, SQL atómico,
estado cambiado y rollback FK con PostgreSQL embebido y transporte Neon de fixture; también
que un observador de pedidos que falla no altera la creación ni el replay. Son pruebas
técnicas, no evidencia de Neon real ni de contención entre conexiones independientes.

El orquestador ejecutó el 2026-10-03 (13:33:46Z) el flujo real descrito arriba: backup AES-256-GCM
con clave independiente fuera del repo, export del catálogo, clon temporal de dev
(`br-lingering-mouse-auy47bw4`) con un solo precio alterado, dry-run con SHA y restore atómico.
Comparó las nueve tablas completas, el schema y el ledger con el backup (huella `10501f6e…0e1c`),
con dev intacto, y borró el clon (`deletedAt` 13:36:49Z). El proof con IDs y huellas está en la
orquestación local; contiene conteos y hashes, no filas ni secretos.

T-21 permanece parcial hasta la integración PWA (parche preparado, se aplica tras T-20), CI verde
y la correlación sobre un Preview identificado por SHA. El reporte global vive en
`estado-plan.md`; esta guía no declara el cierre del bloque.
