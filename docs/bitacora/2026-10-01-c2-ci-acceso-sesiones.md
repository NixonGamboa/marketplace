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

## Validación y cierre

Código final: `5b95e0de7f744cc0839da113a5f520ac98294aba`, en la feature, sin incorporar/publicar. Pasaron los cuatro lockfiles y el gate completo: **518 tests backend en 24 suites, 20 PWA en cinco suites y 80 admin en 13 suites; 618 en total**. Typecheck backend/API/shared, raíz y app/node de ambos frontends, drift y lint pasan; tres warnings previos por app. El build unificado pasó y mantiene demo/precache aproximado 28.2 MiB. Se parseó el workflow y se comprobó orden de gates y permisos mínimos.

Codex añadió cinco pruebas sobre PostgreSQL embebido: se ejecuta el SQL que generan Drizzle y el adapter real, con restricciones, FK, JOIN, revocación y upsert concurrente. Solo el transporte HTTP de Neon se sustituye en el test; no se afirma haber probado Neon real. Las 38 pruebas HTTP de auth ejercitan los handlers con fixtures y criptografía real. La migración 0002 se generó offline y no altera pedidos ni crea cuentas por defecto.

## Rondas de corrección

| Ronda agrupada | Evidencia y responsables | Resultado |
|---|---|---|
| **1 — Auth y tipos** | Codex detectó tres errores TS2345 de helpers inferidos como literales; revisó bypass del límite de login rotando identificadores, protocolo local y claims temporales fraccionarios. Claude corrigió reanudando el mismo ID | Helpers string; cota global login persistente antes del hash, sin reiniciar por éxito; http/https local; NumericDate entero seguro y nuevos tests. Session ya limpiaba cookie al responder 401 y se conservó |
| **2 — Loader Drizzle** | Codex encontró que el CLI buscaba `config.js` inexistente al cargar el fuente TS; otro intento con tsx produjo conflicto de loaders/async hook en Node 24. Se diagnosticaron ambos, sin insistir con la misma vía | Import de extensión fuente real en config Drizzle y `allowImportingTsExtensions` en backend. Loader original conservado, guard intacto, generación offline 0002 y tests/typecheck aprobados |

Son **dos rondas agrupadas de producto/herramientas del proyecto**, no una cifra de cada edición. El archivo MCP inicial faltante fue ajuste del arnés antes de la sesión. Claude denegó escribir el checkpoint ignorado por tratarlo como archivo sensible; no se cambiaron permisos ni se insistió: devolvió resumen en texto final, que Codex registró en sus documentos asignados.

## Conteo final y cierre de ejecutores

- **Claude Code:** una sesión nueva (`c1481c21-bde9-457b-a39f-02605fea0407`), una reanudación por ID y dos procesos con sesión efectiva. Hubo tres invocaciones CLI contando el fallo previo a inicialización por MCP vacío inexistente.
- **Modelo:** `claude-sonnet-5-5`, esfuerzo high explícito en ambas ejecuciones. Inicial: 108 turnos internos, 1.203.779 ms y una denegación de Write del checkpoint; corrección: 15 turnos, 86.881 ms y cero denegaciones. Los turnos internos no son sesiones nuevas ni rondas correctivas.
- **Codex:** el chat orquestador existente; cero ejecutores delegados nuevos y cero Codex CLI. El ejecutor `api_entorno` de C1 ya estaba finalizado y no recibió trabajo en C2. El modelo efectivo del chat no lo expone la herramienta; no se inventa un ID.
- Ambos procesos Claude terminaron y se conservan logs/resultados locales ignorados. No hay ejecutores de C2 activos, API de pago, créditos comprados ni resets consumidos. No se conoce un porcentaje verificable de cuota restante Claude.

T-03b queda parcial por falta de Actions remoto; T-05 parcial por falta de migración/configuración/smoke cloud y acceso privado a pedidos (T-06). El plan distingue disponibilidad en feature de estado en develop. La siguiente intervención es autorizar integración/publicación en develop, dos variables auth solo Preview/develop, migración 0002 solo Neon dev/maui y smoke con cuentas temporales de test. No se ejecutó ninguna de esas escrituras cloud.

## Aprendizajes

Un solo ejecutor permitió a Codex reservar capacidad para revisión y ejecutar los gates sin enviarle logs completos a otro modelo. Reanudar por ID resolvió una corrección relacionada con 15 turnos frente a los 108 de la implementación inicial; esos datos no prueban una relación general de ahorro.

La reserva por identificador sola no acota ataques con identificadores cambiantes. La cota global temporal limita ese costo, pero comparte disponibilidad entre usuarios; se documentó la consecuencia y se dejó su afinamiento en T-06. El test de SQL embebido aportó evidencia de restricciones y reservas atómicas sin escribir en recursos externos.

Los tests de carga de configuración de C1 no acreditaban la ejecución del generador real. Ejecutarlo reveló el problema de resolución de fuente; la corrección conservó el guard y se verificó generando SQL. Los conteos separan sesiones, procesos, turnos, fallos del arnés y rondas agrupadas, evitando presentar cada intento local como una sesión IA nueva.
