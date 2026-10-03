# Build y despliegue de test (T-23)

El destino de esta entrega es el Preview estable de `develop`:
<https://marketplace-git-develop-infogamboatech-2785.vercel.app>. La PWA se sirve en `/`,
el admin en `/admin/` y la API JSON en `/api/`, con sesiones del servidor y Neon Postgres.
El acceso conserva la protección de Vercel. No se promueve `master` ni Production.

## Setup y builds reproducibles

Usar Node 24 y los lockfiles del repositorio. Desde la raíz:

```text
npm run ci:install
npm run ci:check
npm run ci:build
```

`ci:build`, `build:unified` y `vercel-build` generan ambas apps en modo real. Vercel ejecuta
`ci:install` como instalación y el build no vuelve a modificar dependencias. Las llamadas de
las apps usan `/api` del mismo origen; no incluir secretos en variables `VITE_*`.
El modo demo se conserva explícitamente con `npm run build:demo`, separado del entregable.

`/build-info.json` identifica SHA, modo y fecha del artefacto; su respuesta no se almacena.
Comprobar su SHA junto con el deployment Vercel identificado y `/api/health`:
HTTP 200, `environment=test` y `database=connected`. Un artefacto real o un health aislado
no sustituyen el E2E de compra entre dos contextos independientes.

## Configuración aislada

Configurar únicamente Preview/develop: `APP_ENV=test`, `DB_DRIVER=postgres`, `DATABASE_URL`
de Neon dev/maui, `AUTH_JWT_SECRET` privado y `AUTH_ORIGIN` exactamente igual al origen
estable de test. Mantener los guards `TEST_DATABASE_HOST/NAME` y
`PRODUCTION_DATABASE_HOST/NAME` y el almacenamiento Blob de test. Conservar las variables
y datos de Production. La protección de deployment sigue activa; automatización con el
mecanismo de bypass existente, restringido al host de test y sin publicar su valor.

La versión final y sus pruebas sobre el destino están en el documento de entrega T-24;
el estado global y los enlaces de los PRs viven en [el plan](estado-plan.md).

## Migraciones, seed y reset

Desde `maui-back`, con `.env.local` privado preparado para la base de test y los guards:

```text
npm run db:migrate
npm run seed:manifest
npm run seed:test
npm run smoke:test
npm run reset:test
```

`reset:test` sin confirmación hace dry-run. Solo ejecutar con la confirmación/huella recién
obtenida, el guard de T-16 y el alcance autorizado; después repetir `seed:test` y comprobar
su idempotencia. Revisar los parámetros exactos del CLI en [README del backend](../../maui-back/README.md).
El reset permanente está autorizado exclusivamente para Neon dev/maui; no autoriza reset
de otro destino ni migraciones destructivas. Antes de cada corrida E2E completa, resetear,
resembrar y emitir un ready nuevo ligado a SHA, deployment y fecha del reset.

Para backup cifrado, restauración en clon temporal, diagnóstico por `X-Request-Id` y
rollback compatible con el ledger, usar [la guía de operación](operacion-test.md).
Las cuentas de test y sus contraseñas se mantienen fuera del repositorio y no se entregan
en esta preparación.
