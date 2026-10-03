# Entrega del ambiente de test (T-24) — BORRADOR

> **Estado:** borrador local, sin commit. Ninguna prueba sobre el despliegue final se ha ejecutado.
> Las secciones «Pendiente» se completan con resultados reales; no se rellenan por estimación.
> No contiene credenciales, tokens ni valores de bypass.

## Acceso y versión

| Dato | Valor |
|---|---|
| URL estable de test | <https://marketplace-git-develop-infogamboatech-2785.vercel.app> |
| PWA / Admin / API | `/` · `/admin/` · `/api/` |
| Protección | Vercel Deployment Protection activa; acceso con la cuenta del entorno o bypass restringido al host de test |
| Versión desplegada (SHA) | **Pendiente:** se toma de `/build-info.json` del deployment final tras integrar T-22 |
| Deployment Vercel (ID/URL inmutable) | **Pendiente** |
| Modo del build | Esperado `real`; **pendiente** de confirmar en `/build-info.json` |
| Fecha/hora del despliegue y del último reset | **Pendiente** |
| Cuentas de test | Se entregan por canal privado; no se publican aquí (owner, operator, clientes `@seed.maui.invalid`) |

## Setup

Node 24 y lockfiles del repositorio (guía completa: `docs/tecnicos/despliegue-test.md`).

```text
npm run ci:install
npm run ci:check
npm run ci:build
```

Variables solo en Preview/develop: `APP_ENV=test`, `DB_DRIVER=postgres`, `DATABASE_URL` (Neon dev/maui),
`AUTH_JWT_SECRET`, `AUTH_ORIGIN` (= URL estable), guards `TEST_DATABASE_*` / `PRODUCTION_DATABASE_*` y
Blob de test. Production no se modifica.

## Migraciones, seed y reset

Desde `maui-back`, con `.env.local` privado:

```text
npm run db:migrate
npm run seed:manifest
npm run seed:test -- --dry-run
npm run seed:test
npm run smoke:test
```

Reset (solo Neon dev/maui, guard de T-16: `APP_ENV=test`, `RESET_TARGET=dev/maui`, endpoint fijo):

```text
npm run reset:test                                   # dry-run → confirmationToken
npm run reset:test -- --execute --confirm=<token>    # token recién obtenido
npm run seed:test                                    # resembrar; repetir para comprobar idempotencia
```

Restaurar = reset + seed. Backup, restauración en clon y rollback: `docs/tecnicos/operacion-test.md`.

## Comando E2E (T-22, **no integrado al momento de este borrador**)

Los nombres provienen de la rama `feature/runner-e2e-real` y deben confirmarse al integrarla:

```text
npm run e2e:check     # solo lectura: API de test conectada y apps en modo real
npm run e2e:smoke     # crea un pedido propio; consume el ready
node scripts/e2e-run.mjs full   # suite completa (@smoke|@completo); consume el ready
```

Requisitos: `orquestacion-local/night-cloud-ready.json` publicado por root tras identificar el deployment y
dejar el seed limpio; cada ready se consume una vez, y otra corrida completa exige reset y ready nuevos.
Credenciales (`SMOKE_*`) y bypass solo por entorno.

## Resultados

### Gates locales de T-23 (ejecutados 2026-10-03, sobre `155dc6a` + docs)

| Gate | Resultado |
|---|---|
| `npm run ci:check` | exit 0: typecheck (back/pwa/admin), contratos, lint, tests back 1171, pwa 272, admin 226 |
| `npm run ci:build` (real) | exit 0; `verify-pwa-build` aprobado (precache 593.2 KiB, `sw.js` 22.1 KiB); `build-info mode=real` |
| `npm run build:demo` | exit 0; `build-info mode=demo`; hashes de bundle distintos del real |

Son evidencia local; no sustituyen las pruebas sobre el despliegue.

### Pruebas sobre el despliegue final — **Pendiente**

| Prueba | Resultado |
|---|---|
| `/build-info.json` (SHA = deployment, `mode=real`) | Pendiente |
| `/api/health` (`environment=test`, `database=connected`) | Pendiente |
| Rutas profundas PWA/admin y `/api/*` desconocida → JSON 404 | Pendiente |
| `smoke:test` contra la URL de test | Pendiente |
| E2E: compra entre dos contextos independientes | Pendiente |
| Persistencia tras recarga y nueva sesión | Pendiente |
| Edición de catálogo en admin visible en la PWA | Pendiente |
| Flujo completo del pedido, comprobante y enlaces `wa.me` | Pendiente |
| Reset + resembrado + idempotencia | Pendiente |

## Limitaciones

- T-22 no está integrada: no hay E2E de navegador ni evidencia sobre el despliegue final.
- Sin gateway de mensajería externo: el contacto usa enlaces `wa.me` con texto preparado.
- Sin acuerdos, reuniones ni pruebas humanas; el alcance es validación técnica automatizada.
- El acceso exige la protección de Vercel; las cuentas de test se entregan por canal privado.
