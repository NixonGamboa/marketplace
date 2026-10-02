# ADR-002 — Cuentas y sesiones propias revocables

Fecha: 2026-10-01. Alcance: T-05; autorización completa HTTP en T-06, conexión de pantallas en T-17/T-18.

## Decisión

Se adopta JWT propio dentro de las alternativas de [ADR-001](adr-001-stack-backend.md). No requiere proveedor nuevo, cuenta, cuota API ni servicio de mensajería. `jose` firma/verifica HS256; una fila de sesión en Postgres permite revocar antes de expirar. Los casos de uso dependen de puertos de contraseña, token, reloj, IDs y persistencia, sin depender de Vercel.

El JWT solo identifica cuenta y sesión; no concede roles ni tienda desde claims. Cada lectura comprueba sesión vigente/no revocada y carga cuenta activa, con rol y tienda actuales. Expira a las ocho horas, sin refresh automático. Logout revoca en servidor y elimina la cookie. Rotar la clave invalida los JWT anteriores; recuperación de contraseña y Magic Link avanzado quedan fuera de este incremento.

Las contraseñas se derivan con scrypt asíncrono, sal aleatoria y comparación de tiempo constante. El formato almacenado tiene versión y parámetros acotados; nunca se envía hash al navegador. La implementación usa una combinación de parámetros de la [guía de almacenamiento de contraseñas de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), mediante la [API crypto de Node 24](https://nodejs.org/docs/latest-v24.x/api/crypto.html). La firma y validación siguen las interfaces de [jose](https://github.com/panva/jose/tree/main/docs).

## Identidad y frontera HTTP

Registro público crea únicamente customer con ID aleatorio, nombre, teléfono colombiano normalizado y contraseña. El teléfono es contacto no verificado; no basta para iniciar sesión ni para acceder a pedidos de otra cuenta. El login de personal usa email/contraseña; owner/operator y tienda se provisionan en servidor, sin endpoint público para elegir privilegios. Las cuentas de test se provisionan por el seed de T-16 o un mecanismo controlado del servidor, con credenciales fuera del bundle.

La sesión viaja solo en cookie HttpOnly, SameSite=Strict, host-only y Path=/; Secure y prefijo `__Host-` fuera de local. Las respuestas auth usan no-store. Las mutaciones exigen origen exacto configurado en `AUTH_ORIGIN`, sin derivarlo de cabeceras reenviables. `AUTH_JWT_SECRET` es material aleatorio base64 de al menos 32 bytes, sin valor por defecto. Ambos se validan al usar auth; health no depende de ellos.

Los intentos se reservan en Postgres de forma atómica antes de derivar contraseñas. Hay ventanas por identificador y cotas globales conservadoras: login 60/15 minutos y registro 30/hora. La cota global evita eludir el costo de hashing cambiando de identificador, pero es compartida: agotarla bloquea temporalmente todos los accesos/altas. T-06 debe afinar la política de abuso del runtime con fuentes confiables. Las claves de bucket son opacas. Los errores públicos no incluyen contraseña, token, hash, SQL ni URL de conexión.

## Consecuencias y validación pendiente

La base anterior usa perfiles locales y auth demo; esos consumidores se reemplazan en T-17/T-18. T-06 conecta esta sesión a los endpoints de pedidos: cliente solo los suyos, owner/operator solo su tienda según la cuenta vigente, ajenos como inexistentes, mutaciones con origen exacto y límite persistente de creación por cuenta. Las cotas globales de login/registro se conservan: no se adoptó un límite por IP porque depende de qué cabecera de proxy es confiable en cada runtime. Esa validación local no acredita el comportamiento en Preview hasta su smoke real.

La migración de auth es aditiva y se genera offline; no modifica pedidos ni crea cuentas por defecto. Se valida con pruebas aisladas y SQL local; tras la aprobación explícita de C2 se aplicó 0002 solo a Neon dev/maui y se verificaron 19 checks HTTP reales de registro, login, sesión, logout/replay y cuenta deshabilitada en Preview develop. Tres cuentas temporales fueron retiradas con sus sesiones; el pedido previo se conservó. Evidencia en el [plan](estado-plan.md). Ningún test memory o build demo acredita el cierre cloud.
