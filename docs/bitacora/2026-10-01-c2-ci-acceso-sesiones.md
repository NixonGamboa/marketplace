# Bitácora C2 — CI y acceso con sesiones

## Inicio y reparto

El usuario pidió continuar después de proponer T-03b/T-05. Codex comprobó el plan, las dependencias T-02/T-03a/T-04 y la igualdad de develop/origin/develop en `cde73d3`. Abrió `feature/ci-acceso-sesiones` desde esa base. El archivo histórico ajeno `2026-10-01-auditoria-plan-orquestacion-ia.md` permaneció fuera de los cambios.

La ventana de cinco horas de Codex estaba usada al 66% y la semanal al 45%; saldo de créditos cero. Claude estaba autenticado con claude.ai/Pro y proveedor firstParty; no había variables de API de pago. Se eligió un único ejecutor Claude y el chat Codex existente para conservar capacidad de integración. No se lanzó otro Codex CLI ni delegado al iniciar.

| Sesión | Modelo / esfuerzo | Responsabilidad |
|---|---|---|
| Claude `c1481c21-bde9-457b-a39f-02605fea0407` | `claude-sonnet-5-5` / `high`, confirmados por salida estructurada y flags | Contratos auth, cuentas, contraseñas, sesiones JWT revocables, adapters y endpoints auth; pruebas asociadas |
| Codex, chat existente | El modelo efectivo del chat no está expuesto por las herramientas | CI, paquetes/locks, generación offline de migración, revisión y gates; plan y esta bitácora |

El ownership separó configuración/paquetes/migración/documentación del código de auth. Claude recibió un encargo concreto y solo herramientas de archivos; los comandos, instalaciones y comprobaciones quedaron en Codex. Se deshabilitaron MCP, comandos slash y herramientas de agentes. Un archivo MCP vacío faltante produjo un fallo local antes de iniciar proveedor; se creó el archivo y se inició la sesión. No cuenta como sesión ni corrección de producto.

## Decisiones de construcción

Se eligió JWT propio dentro de las alternativas del ADR, con firma/verificación mediante `jose`, estado revocable en Postgres y contraseña mediante scrypt asíncrono de Node. El teléfono es contacto capturado, sin verificación ni identidad derivada de su número. Las cuentas de personal se provisionan en servidor; registro público solo de cliente, sin rol ni tienda elegibles.

CI usa Node 24.x y versiones instaladas con cuatro lockfiles. Las Actions se fijaron por SHA consultado en los repositorios oficiales. El typecheck ahora comprueba `tsconfig.app.json` y `tsconfig.node.json` en ambas apps. Los gates preceden al build unificado y no usan credenciales cloud. La PWA dejó de almacenar respuestas genéricas de API para no persistir sesiones; la política completa de caché pública/privada sigue en T-20.

La integración de las pantallas continúa en T-17/T-18; autorización exhaustiva del API de pedidos en T-06. No se contará esta base como acceso privado a pedidos hasta comprobar esa dependencia. La publicación/Preview y una migración nueva necesitan autorización propia de este incremento; la autorización cloud anterior era exclusiva de C1.

## Validación y cierre local anterior a la aprobación

Código final: `5b95e0de7f744cc0839da113a5f520ac98294aba`, en la feature, sin incorporar/publicar. Pasaron los cuatro lockfiles y el gate completo: **518 tests backend en 24 suites, 20 PWA en cinco suites y 80 admin en 13 suites; 618 en total**. Typecheck backend/API/shared, raíz y app/node de ambos frontends, drift y lint pasan; tres warnings previos por app. El build unificado pasó y mantiene demo/precache aproximado 28.2 MiB. Se parseó el workflow y se comprobó orden de gates y permisos mínimos.

Codex añadió cinco pruebas sobre PostgreSQL embebido: se ejecuta el SQL que generan Drizzle y el adapter real, con restricciones, FK, JOIN, revocación y upsert concurrente. Solo el transporte HTTP de Neon se sustituye en el test; no se afirma haber probado Neon real. Las 38 pruebas HTTP de auth ejercitan los handlers con fixtures y criptografía real. La migración 0002 se generó offline y no altera pedidos ni crea cuentas por defecto.

## Rondas de corrección

| Ronda agrupada | Evidencia y responsables | Resultado |
|---|---|---|
| **1 — Auth y tipos** | Codex detectó tres errores TS2345 de helpers inferidos como literales; revisó bypass del límite de login rotando identificadores, protocolo local y claims temporales fraccionarios. Claude corrigió reanudando el mismo ID | Helpers string; cota global login persistente antes del hash, sin reiniciar por éxito; http/https local; NumericDate entero seguro y nuevos tests. Session ya limpiaba cookie al responder 401 y se conservó |
| **2 — Loader Drizzle** | Codex encontró que el CLI buscaba `config.js` inexistente al cargar el fuente TS; otro intento con tsx produjo conflicto de loaders/async hook en Node 24. Se diagnosticaron ambos, sin insistir con la misma vía | Import de extensión fuente real en config Drizzle y `allowImportingTsExtensions` en backend. Loader original conservado, guard intacto, generación offline 0002 y tests/typecheck aprobados |

En el cierre local eran **dos rondas agrupadas de producto/herramientas del proyecto**, no una cifra de cada edición. El archivo MCP inicial faltante fue ajuste del arnés antes de la sesión. Claude denegó escribir el checkpoint ignorado por tratarlo como archivo sensible; no se cambiaron permisos ni se insistió: devolvió resumen en texto final, que Codex registró en sus documentos asignados.

## Conteo al cierre local y cierre de ejecutores

- **Claude Code:** una sesión nueva (`c1481c21-bde9-457b-a39f-02605fea0407`), una reanudación por ID y dos procesos con sesión efectiva. Hubo tres invocaciones CLI contando el fallo previo a inicialización por MCP vacío inexistente.
- **Modelo:** `claude-sonnet-5-5`, esfuerzo high explícito en ambas ejecuciones. Inicial: 108 turnos internos, 1.203.779 ms y una denegación de Write del checkpoint; corrección: 15 turnos, 86.881 ms y cero denegaciones. Los turnos internos no son sesiones nuevas ni rondas correctivas.
- **Codex:** el chat orquestador existente; cero ejecutores delegados nuevos y cero Codex CLI. El ejecutor `api_entorno` de C1 ya estaba finalizado y no recibió trabajo en C2. El modelo efectivo del chat no lo expone la herramienta; no se inventa un ID.
- Ambos procesos Claude terminaron y se conservan logs/resultados locales ignorados. No hay ejecutores de C2 activos, API de pago, créditos comprados ni resets consumidos. No se conoce un porcentaje verificable de cuota restante Claude.

T-03b queda parcial por falta de Actions remoto; T-05 parcial por falta de migración/configuración/smoke cloud y acceso privado a pedidos (T-06). El plan distingue disponibilidad en feature de estado en develop. La siguiente intervención es autorizar integración/publicación en develop, dos variables auth solo Preview/develop, migración 0002 solo Neon dev/maui y smoke con cuentas temporales de test. No se ejecutó ninguna de esas escrituras cloud.

## Aprendizajes

Un solo ejecutor permitió a Codex reservar capacidad para revisión y ejecutar los gates sin enviarle logs completos a otro modelo. Reanudar por ID resolvió una corrección relacionada con 15 turnos frente a los 108 de la implementación inicial; esos datos no prueban una relación general de ahorro.

La reserva por identificador sola no acota ataques con identificadores cambiantes. La cota global temporal limita ese costo, pero comparte disponibilidad entre usuarios; se documentó la consecuencia y se dejó su afinamiento en T-06. El test de SQL embebido aportó evidencia de restricciones y reservas atómicas sin escribir en recursos externos.

Los tests de carga de configuración de C1 no acreditaban la ejecución del generador real. Ejecutarlo reveló el problema de resolución de fuente; la corrección conservó el guard y se verificó generando SQL. Los conteos separan sesiones, procesos, turnos, fallos del arnés y rondas agrupadas, evitando presentar cada intento local como una sesión IA nueva.

## Continuación autorizada: PR, CI y test real

El usuario aprobó con «zi» la integración/publicación y las escrituras cloud descritas. Al preguntar si las integraciones se hacían por PR, Codex aclaró que las anteriores eran fast-forward y adoptó PR para C2. Se publicó la feature, abrió [PR #1](https://github.com/NixonGamboa/marketplace/pull/1), esperó CI y la fusionó por merge: `be5ba89`. El cierre documental se preparó aparte desde ese develop en `feature/cierre-ci-sesiones`, también mediante PR.

**Ronda 3 — lockfile Linux:** el run 36944975009 falló al instalar: npm 11.19 en Linux requería peers @emnapi/core/runtime 1.11.3 omitidos por el lock generado en Windows/npm 11.6. La primera regeneración con npm local no modificó el lock. Codex diagnosticó la versión y usó npm 11.19 en una carpeta ignorada, regeneró metadata y comprobó instalación Linux antes de publicar `d427758`. No cambió versiones funcionales existentes ni ajustes globales. [Run 36945438832](https://github.com/NixonGamboa/marketplace/actions/runs/36945438832) pasó instalación, tipos, lint, 618 tests y build antes del merge.

Codex configuró AUTH_JWT_SECRET sensitive y AUTH_ORIGIN exacto solo Preview/develop. Vercel construyó `be5ba89` con Node 24.x, deployment `dpl_75LY31bbMYRKJYGxYHSRemBE4rQZ`, READY. Cinco checks previos pasaron contra el alias estable: health conectado/test, sesión anónima, método, origen y validación del body. Se usó el bypass existente sin desactivar protección ni divulgar credenciales.

El guard de migración se detuvo antes de mutar: 0000 tenía CRLF en el checkout Windows, mientras su hash histórico correspondía a LF. La consulta del ledger y el hash canónico confirmaron igualdad; se corrigió el comprobador local y se aplicó 0002 solo a Neon dev/maui. Journal pasó de dos a tres entradas; auth tiene tres tablas. Orders mantuvo un pedido y fingerprint completo idéntico. Es un ajuste del arnés cloud, no una cuarta ronda del producto.

El smoke probó **19 checks HTTP reales**, tres roles, registro público customer sin privilegios, cookie segura, login, logout/replay, cuenta deshabilitada y origen incorrecto. Staff se provisionó mediante el caso de uso real con Postgres/scrypt; no se añadió endpoint de privilegios. Finalmente se eliminaron los tres IDs temporales. La consulta auxiliar de comprobación falló; SQL independiente confirmó cero cuentas/sesiones y orders/fingerprint conservados. No se repitió el smoke ni se reseteó la BD. Este segundo ajuste de comprobación también se registra separado de las rondas del producto. Los buckets opacos de rate limit permanecen; no se reinician límites compartidos.

**Conteo definitivo C2:** una sesión nueva Claude Code, una reanudación del mismo ID, dos procesos con sesión efectiva y tres invocaciones contando el fallo previo a inicialización. Codex: un chat orquestador existente, cero sesiones CLI y cero ejecutores delegados nuevos. La continuación cloud no lanzó sesiones adicionales. **Tres rondas correctivas agrupadas**: auth/types con Claude reanudado; loader Drizzle con Codex; peers CI/Linux con Codex. Los dos ajustes del comprobador cloud y los fallos del arnés inicial se distinguen de esas rondas. Los ejecutores permanecen cerrados; suscripciones, sin API facturada/créditos/reset.

T-03b queda hecho. T-05 conserva estado parcial por autorización de pedidos T-06 y conexión frontend T-17/T-18. No se inició T-06 ni se modificó master/Production/main. Se actualizó el [plan](../tecnicos/estado-plan.md), ADR, README backend y registro de ejecución. El siguiente paso es T-06 con alcance propio; C2 ya no requiere intervención.
