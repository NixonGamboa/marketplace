# E2E de navegador (T-22)

Runner Playwright que usa el **Chrome instalado** (`channel: 'chrome'`, o `E2E_CHROME_PATH`); no descarga navegadores. Dos contextos independientes (cliente en la PWA, personal en `/admin`) contra la API y Postgres reales del Preview de test. No hay mocks de auth, pedidos ni catálogo.

| Comando | Qué hace |
|---|---|
| `npm run e2e:selftest` | Guardas, saneado y lectura del ready; sin red, credenciales ni navegador (corre en `ci:check`) |
| `npm run e2e:check` | Solo lectura: `/api/health` = test/connected y PWA/admin en modo **real** (no demo) |
| `npm run e2e:smoke` | Crea **un** pedido propio y recorre cliente → recepción → pesos reales → entrega → comprobante/audit/enlaces |
| `node scripts/e2e-run.mjs full` | Smoke + suite completa: permisos, persistencia/nueva sesión, cierre/agotado, precio manipulado, doble envío, timeout posterior al commit, 401/429/503, offline/3G, sustitución/cancelación y catálogo editado |
| `npm run typecheck:e2e` | Tipos del runner |

## Condiciones de ejecución

- `check`, `smoke` y `full` exigen `orquestacion-local/night-cloud-ready.json` (lo publica root con el Preview identificado, en modo real y con el seed limpio). El launcher toma de ahí `BASE_URL`/`AUTH_ORIGIN` y el SHA. `smoke` y `full` **consumen** cada ready una sola vez: otra corrida con escrituras requiere reset y ready nuevos. `full` requiere T-20/T-21 integrados y confirmados por root.
- Credenciales y bypass solo por entorno, nunca impresos: `SMOKE_CUSTOMER_PHONE`, `SMOKE_CUSTOMER_PASSWORD`, `SMOKE_STAFF_EMAIL`, `SMOKE_STAFF_PASSWORD`; `SMOKE_OWNER_EMAIL`/`SMOKE_OWNER_PASSWORD` si el personal no es owner; `SMOKE_OPERATOR_EMAIL`/`SMOKE_OPERATOR_PASSWORD` para los permisos negativos del operator (sin ellos queda un hallazgo); `SMOKE_BYPASS_TOKEN` (o `SMOKE_VERCEL_BYPASS`) para Previews protegidos (solo se envía al hostname del Preview).
- Solo Previews `*.vercel.app` (o loopback sin bypass para desarrollo local).
- Si la tienda está cerrada, el owner la abre por API y el override se restaura al final (y al inicio de la siguiente corrida si una anterior se interrumpió).
- Los fixtures leen antes el producto de personal con su `version` real (el DTO público no la trae), registran valor previo y aplicado en `e2e-runtime.json` y restauran en orden inverso; solo revierten si el valor sigue siendo el que dejó el runner. Cada prueba de `@completo` parte de canasta vacía y sesiones vigentes, así que un fallo no oculta las demás.
- Contacto técnico temporal cuando falta el contacto del seed, cierre/stock y precio se registran antes de cambiarlos y se restauran incluso si falla el escenario. No se toca ningún pedido ajeno; quedan únicamente los pedidos propios para limpieza de root. Una interrupción de proceso puede impedir el `afterAll`: revisar `e2e-runtime.json` antes del reset o de continuar.

## Salidas saneadas (en `orquestacion-local/`, fuera de git)

- `e2e-runtime.json`: claves de idempotencia, IDs de pedido, snapshots acotados de fixtures técnicos, estado del override y hallazgos.
- `e2e-result.json`: resultado por prueba con errores saneados.
- `e2e-artifacts/`: capturas saneadas (nunca en login, con campos enmascarados).

Trazas, video y screenshots automáticos están desactivados: contienen red y formularios con credenciales. El service worker está permitido en ambos contextos. La cookie de Protection se prepara exclusivamente en el origen identificado antes de navegar, para cubrir también sus fetch públicos. WhatsApp se aborta: los enlaces `wa.me` se comprueban, no se abren.

429/503 son fallos de transporte controlados y acotados al POST del escenario; no acreditan políticas reales de rate limit o una caída real de Postgres. El timeout envía primero el POST real y retiene su respuesta 17 s (timeout del cliente: 15 s), verifica persistencia, recarga y reintenta con la misma clave. Chrome emula latencia/ancho de banda 3G sin reemplazar respuestas exitosas. El 401 revoca la sesión real por logout API. Ningún resultado local ni selftest sustituye la corrida completa sobre el Preview.
