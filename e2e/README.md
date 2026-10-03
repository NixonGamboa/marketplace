# E2E de navegador (T-22)

Runner Playwright que usa el **Chrome instalado** (`channel: 'chrome'`, o `E2E_CHROME_PATH`); no descarga navegadores. Dos contextos independientes (cliente en la PWA, personal en `/admin`) contra la API y Postgres reales del Preview de test. No hay mocks de auth, pedidos ni catálogo.

| Comando | Qué hace |
|---|---|
| `npm run e2e:selftest` | Guardas, saneado y lectura del ready; sin red, credenciales ni navegador (corre en `ci:check`) |
| `npm run e2e:check` | Solo lectura: `/api/health` = test/connected y PWA/admin en modo **real** (no demo) |
| `npm run e2e:smoke` | Crea **un** pedido propio y recorre cliente → recepción → pesos reales → entrega → comprobante/audit/enlaces |
| `npm run typecheck:e2e` | Tipos del runner |

## Condiciones de ejecución

- `check` y `smoke` exigen `orquestacion-local/night-cloud-ready.json` (lo publica root con el Preview identificado, en modo real y con el seed limpio). El launcher toma de ahí `BASE_URL`/`AUTH_ORIGIN` y el SHA. `smoke` **consume** cada ready una sola vez: otra corrida completa requiere reset y ready nuevos.
- Credenciales y bypass solo por entorno, nunca impresos: `SMOKE_CUSTOMER_PHONE`, `SMOKE_CUSTOMER_PASSWORD`, `SMOKE_STAFF_EMAIL`, `SMOKE_STAFF_PASSWORD`; `SMOKE_OWNER_EMAIL`/`SMOKE_OWNER_PASSWORD` si el personal no es owner; `SMOKE_BYPASS_TOKEN` para Previews protegidos (solo se envía al hostname del Preview).
- Solo Previews `*.vercel.app` (o loopback sin bypass para desarrollo local).
- Si la tienda está cerrada, el owner la abre por API y el override se restaura al final (y al inicio de la siguiente corrida si una anterior se interrumpió).

## Salidas saneadas (en `orquestacion-local/`, fuera de git)

- `e2e-runtime.json`: claves de idempotencia, IDs de pedido, estado del override y hallazgos.
- `e2e-result.json`: resultado por prueba con errores saneados.
- `e2e-artifacts/`: capturas saneadas (nunca en login, con campos enmascarados).

Trazas, video y screenshots automáticos están desactivados: contienen red y formularios con credenciales. El service worker se bloquea en este smoke (su validación es T-20) y las peticiones a WhatsApp se abortan: los enlaces `wa.me` se comprueban, no se abren.
