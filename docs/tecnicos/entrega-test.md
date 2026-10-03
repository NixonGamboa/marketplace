# Ambiente de test — preparación de entrega T-24

Entrega técnica completa y validada el 2026-10-03. Versión certificable congelada para la prueba del usuario. Las credenciales se entregan exclusivamente en un archivo local ignorado por Git; no se publican en este documento ni en PRs. No se promueve Production.

## Acceso y versión comprobada

| Dato | Valor |
|---|---|
| URL estable | [Abrir ambiente de test](https://marketplace-git-develop-infogamboatech-2785.vercel.app) |
| PWA / admin / API | `/` · `/admin/` · `/api/` |
| Código probado | `89a588a79f567949e077a5569f80d8350fa78233` |
| Tag certificable | [`mvp-v1.0.0`](https://github.com/NixonGamboa/marketplace/tree/mvp-v1.0.0), publicado sobre el código probado |
| Deployment probado | `dpl_AFEAUeW8k3mfzyxKqSNNvyk1GF2P` |
| Build | `real`, generado 2026-10-03T15:23:52.235Z |
| E2E finalizado | 2026-10-03T15:38:12.767Z |
| Último reset y seed comprobados | 2026-10-03T15:42:59.454Z |
| Base | Neon dev/maui, aislada de Production |
| Protección | Vercel Deployment Protection activa |

Consultar `/build-info.json` para el SHA actual. Un commit posterior de documentación cambia esa identificación sin cambiar el código probado; la integración documental exige CI verde y verificación de equivalencia del código. Acceso humano mediante la cuenta autorizada de Vercel; bypass de automatización restringido al host de test y mantenido en privado.

Mientras el usuario prueba, no se fusiona código de aplicación a `develop`. Solo se incorporan cambios documentales sin modificar runtime, build, dependencias ni configuración. Cada defecto reportado se corrige en un PR independiente, requiere CI verde y una nueva corrida E2E completa contra API/Postgres reales, y se publica con el siguiente tag de parche (`mvp-v1.0.1`, `mvp-v1.0.2`, etc.). El tag `mvp-v1.0.0` no se mueve ni se sobrescribe. No se ejecutan resets ni seeds durante la prueba del usuario sin coordinar el momento, para conservar sus datos de prueba.

## Setup y configuración

Node 24 y npm 11, con los lockfiles del repositorio. Desde la raíz:

```text
npm run ci:install
npm run ci:check
npm run ci:build
```

La entrega unificada genera PWA y admin reales. `npm run build:demo` conserva el demo por separado; reconstruir con `ci:build` antes de usar un artefacto de entrega. [Guía de despliegue](despliegue-test.md).

Preparar `maui-back/.env.local` privado con `APP_ENV=test`, `DB_DRIVER=postgres`, `DATABASE_URL` de dev/maui, `AUTH_JWT_SECRET`, `AUTH_ORIGIN` igual a la URL estable, guards `TEST_DATABASE_HOST/NAME` y `PRODUCTION_DATABASE_HOST/NAME`, y credenciales `SEED_*` fuera del bundle. El almacenamiento Blob de test conserva su configuración existente. Ningún valor secreto se incorpora al repositorio ni a variables `VITE_*`.

## Migraciones, seed, reset y recuperación

Desde `maui-back`, con configuración privada preparada:

```text
npm run db:migrate
npm run seed:manifest
npm run seed:test -- --dry-run
npm run seed:test
npm run smoke:test
```

El ledger contiene ocho migraciones aplicadas. Dataset `test-seed-v1`: una tienda, nueve categorías, 16 productos, cuatro cuentas y nueve pedidos de seed con estados y modalidades representativos. El pedido previo ajeno al seed se conserva.

```text
npm run reset:test
npm run reset:test -- --execute --confirm=<token-reciente-del-dry-run>
npm run seed:test
npm run seed:test
```

Solo dev/maui: `RESET_TARGET=dev/maui`, guard de entorno T-16, dry-run vigente y token/huella. El reset normal conserva la tienda. Los pedidos de smoke se retiran por IDs/claims identificados y con comprobación del destino; no ampliar el borrado a pedidos ajenos. Las seis ejecuciones de reset/reseed del lote conservaron el pedido previo y el ledger; la última retiró 10 pedidos propios y repitió el seed sin cambios.

Reset + seed repone fixtures de test. Recuperar datos de un backup es una operación distinta: [guía de operación y restore](operacion-test.md). T-21 comprobó backup AES-256-GCM y restauración íntegra de nueve tablas/schema/ledger en un clon temporal de dev, después eliminado. El backup Postgres no incluye imágenes Blob; la clave permanece fuera del repositorio.

## Validación automatizada

[Build y CI T-23](https://github.com/NixonGamboa/marketplace/pull/31), [runner y E2E T-22](https://github.com/NixonGamboa/marketplace/pull/27). CI: tipos, lint, drift, 1171 pruebas backend, 272 PWA, 226 admin y 38 selftests del runner. Builds real/demo verificados y distinguibles.

Sobre la URL estable: build real con SHA correcto y `no-store`; health test/Postgres; rutas profundas de ambas apps; API desconocida JSON404. Runner `check`: 2/2. Corrida completa final: **23/23**, con dos contextos independientes y servicios reales, sin nuevas correcciones.

| Escenario de navegador | Resultado |
|---|---|
| ambas apps corren en modo REAL y la sesión empieza cerrada | Aprobado |
| el catálogo público tiene un producto de peso fijo y uno de peso variable disponibles | Aprobado |
| el cliente inicia sesión, arma la canasta y pide con recogida en tienda | Aprobado |
| el admin recibe el pedido nuevo, lo abre y confirma | Aprobado |
| el cliente detecta «Confirmado» sin recargar (sondeo entre dispositivos) | Aprobado |
| el admin prepara, registra el peso real y marca listo | Aprobado |
| el cliente ve «Listo» con total final; el estimado original persiste en el servidor | Aprobado |
| el admin entrega y el cliente detecta «Entregado» con ambos totales persistentes | Aprobado |
| comprobante, enlaces de contacto (sin enviar WhatsApp) y auditoría | Aprobado |
| cierre de sesión de cliente y admin, y restauración de la tienda | Aprobado |
| sesiones aisladas, permisos cruzados, cabeceras de caché y X-Request-ID | Aprobado |
| pedido entregado del smoke persiste en una sesión nueva de cliente | Aprobado |
| precio manipulado y doble clic: un solo pedido con precio autoritativo | Aprobado |
| tienda cerrada: el servidor rechaza (409 STORE_CLOSED) y conserva la canasta | Aprobado |
| agotado por admin: el servidor rechaza, la PWA lo muestra y la canasta sigue | Aprobado |
| timeout después de persistir: la clave sobrevive a la recarga y no duplica | Aprobado |
| fallo controlado 429: conserva la canasta y el reintento crea un solo pedido real | Aprobado |
| fallo controlado 503: conserva la canasta y el reintento crea un solo pedido real | Aprobado |
| sesión revocada: 401, redirige a ingreso y la canasta sobrevive al reingreso | Aprobado |
| offline con SW activo conserva la canasta sin caché privada y se recupera en 3G | Aprobado |
| personal sustituye con declaración de contacto y cancela; histórico y audit persisten | Aprobado |
| edición de catálogo desde admin persiste y llega a la PWA sin deploy | Aprobado |
| cierre: sin excepciones ni WhatsApp, fixtures devueltos y sesiones cerradas | Aprobado |

SQL independiente verificó 10 pedidos propios por sus claims, cuatro fixtures restaurados (contacto, horario, stock y precio), cero sesiones activas, pedido previo intacto y ledger de ocho migraciones. Después se retiraron los pedidos propios y se repuso el seed; el ambiente queda listo para una nueva prueba.

Para repetir desde la raíz, con credenciales `SMOKE_*` privadas:

```text
npm run e2e:check
node scripts/e2e-run.mjs full
```

`full` incluye el smoke de compra y la resiliencia. También existe `npm run e2e:smoke` para el recorrido de compra aislado. Cada corrida con escrituras consume un ready nuevo de `orquestacion-local/night-cloud-ready.json`, publicado tras identificar el Preview y dejar el seed limpio. Reset antes de cada corrida completa; un ready consumido no se reutiliza. Se utiliza Chrome instalado, sin descargar navegadores. [Guía del runner](../../e2e/README.md).

## Límites y siguiente paso

- Credenciales de owner, operator y cliente entregadas en un archivo local ignorado por Git. La fuente privada `SEED_*` se conserva para futuros resets y seeds; ningún secreto forma parte del tag, de este documento o de los PRs.
- El contacto usa enlaces `wa.me`; se verifica destino/texto sin enviar mensajes ni simular notificaciones automáticas.
- 429/503 y timeout son fallos de transporte controlados; no acreditan una caída real de Postgres.
- Cancelación del cliente: pendiente de decisión del usuario; sigue denegada y no se cambia sin respuesta. El personal autorizado sí puede cancelar. Cobertura limitada al casco urbano de Dolores, sin geocerca.
- El campo de precio del admin puede pulirse al recibir foco; la interacción de teclado pasó. La caché offline no incluye imágenes Blob de otro origen. La medición de shell en 3G no mide la carga completa del catálogo.
- Sin acuerdos, pruebas humanas, entrenamiento ni lanzamiento comercial. Production y sus datos/variables permanecen fuera del alcance.

El siguiente paso es la prueba del usuario sobre la versión certificable. Los defectos siguen el proceso de parches indicado arriba. La evolución E-01 a E-08 se inicia solo con un nuevo encargo.
