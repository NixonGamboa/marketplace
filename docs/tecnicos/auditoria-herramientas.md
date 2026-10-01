# MAUI — Auditoría de herramientas y accesos

> **Fecha:** 2026-10-01. **Alcance:** capacidades necesarias para T-01 a T-24 del [plan global](estado-plan.md).
> Auditoría realizada por el agente `auditoria_capacidades`, en solo lectura. Sin editar código, desplegar, migrar, cargar seed, enviar WhatsApp ni ejecutar inferencia en los CLI.

## Resultado

Hay herramientas y accesos suficientes para continuar C1. **Prioridad 0 resuelta con incorporación parcial y commits locales aprobados por el usuario**; evidencia vigente en el plan. No se exige conectar un MCP nuevo cuando la CLI autenticada cubre la acción. El cierre completo del ambiente de test todavía requiere configuración/implementación de storage y validación del aislamiento de recursos.

**Corrección de alcance posterior a la auditoría:** el usuario confirmó que no existe Evolution API y pidió la alternativa más sencilla. T-14 queda como comprobante/seguimiento dentro de las apps y enlaces `wa.me` existentes; mensajería automática pasa a E-07. **La ausencia de gateway ya no bloquea T-01 a T-24.** No hay una conexión/autenticación nueva indispensable identificada para iniciar; storage podría requerir intervención solo si las condiciones de la cuenta lo exigen.

«Listo» en esta auditoría significa capacidad comprobada, no implementación terminada. Auth de los asistentes no certifica disponibilidad de cada modelo ni cuota restante. Las verificaciones posteriores de código se registran únicamente en el plan.

## Evidencia única de pruebas de Claude

Pruebas solicitadas por el usuario el 2026-10-01, posteriores a la auditoría inicial, con Claude Code 2.1.286, auth `claude.ai`/Pro, Sonnet 5.5 y esfuerzo `low`; herramientas/subagentes deshabilitados. Ambos procesos terminaron correctamente.

| Modo | Evidencia de acceso y cierre | Sesión |
|---|---|---|
| No interactivo, JSON | `PONG`, `is_error=false`, exit 0; `modelUsage` confirma `claude-sonnet-5-5`, proveedor `firstParty`; 460 tokens de entrada/5 de salida | `1e5520ab-c112-4275-8e88-9f069b853c33`, sin persistencia, no reanudable |
| Interactivo, PTY | Pantalla Sonnet 5.5/low/Pro; stdin entregado y `PONG` leído; cierre con dos Ctrl-C, exit 0. `/exit` no disponible con slash commands deshabilitados | `243797d2-bb2d-4436-9c31-9ae076cd0467`, persistente; CLI mostró comando resume |

No se midió consumo del modo interactivo ni se compararon modos sobre un trabajo equivalente. Reanudación efectiva, Opus 5.5 y otros esfuerzos no probados. La selección por familia y los aprendizajes se mantienen en [orquestación IA](orquestacion-ia.md); los datos de estas pruebas se conservan solo aquí.

## Matriz de capacidad

| Capacidad / bloques | Estado de herramienta y acceso | Evidencia / necesidad restante |
|---|---|---|
| Codex / todos los bloques | Listo, autenticado | CLI **0.159.3**; login ChatGPT. Selección/ejecución de cada modelo se comprueba al iniciar su primer bloque |
| Claude Code / ejecución | Listo, autenticado; Sonnet 5.5 probado | CLI **2.1.286**; sesión `claude.ai`, proveedor first-party, plan **Pro**. Ping posterior de Sonnet 5.5 con `low` exitoso. Opus/otros esfuerzos y porcentaje de cuota no comprobados |
| Git/GitHub/CI / T-03b, T-23 | Listo; CI pendiente | Git 2.46, gh 2.91; repo `NixonGamboa/marketplace`, permiso ADMIN, Actions habilitado. Sin workflows encontrados. T-03b espera T-02/T-03a |
| Node/npm / T-02, T-03b, T-23 | Parcial por alineación | Node local **24.11.0**, bundled **24.19.0**, npm 11.6.1. Raíz pide `22.x`; proyecto Vercel usa `24.x`. Alinear versión en T-02 antes de fijar CI; decidir por compatibilidad comprobada |
| Lint/typecheck/unitarios / T-03a, T-04, T-15 | Herramientas listas; T-03a cerrado | TypeScript, ESLint y Vitest disponibles. Gate local del código reconciliado y límites de CI/BD/E2E documentados en prioridad 0 del plan |
| Neon/Postgres / T-02, T-07–T-13, T-15, T-16, T-21 | Acceso listo; aislamiento parcial | MCP autorizado ADMIN al proyecto `maui`; branches `main`/`dev`. SELECT real en BD `maui`, branch `dev`, funciona; Postgres 18.6, tablas `orders` y `drizzle.__drizzle_migrations`. Metadata de branch/endpoint reporta archived/idle, pero la lectura responde; no asumir indisponibilidad por metadata |
| Vercel / T-01, T-02, T-21, T-23, T-24 | CLI lista; MCP parcial | CLI global **56.1.0** autenticada: inspect y API GET confirmaron metadata del Preview durante la reconciliación. MCP devuelve 403 para el scope requerido; CLI lo suple. Resolver ruta/version efectiva antes de ejecutar, sin asumir que una CLI temporal anterior sigue instalada |
| API Preview / T-01 | Parcial, deploy real encontrado | Preview 2026-09-29 tiene Functions de health/pedidos. Health: **200 JSON**, `driver=postgres`, usando bypass existente. API inexistente: **404 text/plain**, sin SPA. Falta error estructurado y comprobar BD desde runtime; health no hace SELECT por sí solo |
| Browser/E2E / T-09, T-17–T-20, T-22, T-24 | Automatización lista; suite pendiente | Playwright bundled y Chrome **154.0.8037.59**: headless/contexto/lectura real comprobados. Chrome/Edge instalados. Chromium bundled y `@playwright/test` ausentes; usar Chrome y añadir runner/config reproducibles en T-22 |
| Auth / T-05, T-06 | Implementación pendiente; sin bloqueo externo identificado | ADR admite JWT propio con Postgres/secretos servidor; no requiere conectar Clerk/Supabase por anticipación. Definir y validar sesión/permisos, no simular auth |
| Storage / T-09 | Parcial | Cuenta Vercel accesible y herramientas Blob disponibles; upload/credenciales no configurados en env inspeccionado. Evaluar Vercel Blob del ADR con adapter portable y recurso test; verificar condiciones/cuotas antes de habilitar. Interrumpir si exige conexión del usuario o costo |
| Contacto WhatsApp / T-14 | Herramienta existente; sin acceso externo requerido | PWA/admin ya generan enlaces `wa.me` y texto. Conectar teléfono/datos persistidos y probar destino/contenido; no enviar mensajes externos como parte del E2E. Usuario confirma que no existe Evolution API; automatización pasa a E-07 |
| Logs/restore / T-21 | Herramientas suficientes; implementación pendiente | Logs Vercel vía CLI y SQL Neon disponibles. Implementar métricas/export/restore sobre test aislado; Sentry no se exige si el criterio se cubre con recursos actuales |

## Evidencia cloud y corrección del estado

Preview comprobado: [marketplace-4l6m0bchh-infogamboatech-2785.vercel.app](https://marketplace-4l6m0bchh-infogamboatech-2785.vercel.app). La protección se accedió mediante mecanismo existente sin publicar secretos. El health de ese Preview responde JSON; la evidencia anterior de HTML en el dominio público no debe generalizarse a este artefacto.

Vercel lista `DATABASE_URL` y configuración de bypass en Development/Preview/Production. No se descargaron ni imprimieron sus valores. **No se verificó que Preview use exclusivamente `dev` ni que sus recursos estén separados de Production.** `NODE_ENV=production` en un build Preview es normal y no acredita uso de datos productivos. Hasta comprobar aislamiento, no ejecutar migraciones, seed ni resets sobre el destino cloud.

## Orden de resolución

0. **Prioridad 0 completada:** selección parcial incorporada a develop con aprobación del usuario, gate local completo y separación de commits aprobada. Origen exacto del Preview y evidencia de código en [el plan](estado-plan.md#prioridad-0--reconciliar-la-base-antes-de-implementar).
1. **T-01/T-02:** completar ruta API/errores y conexión real desde runtime; verificar destino BD/recursos sin exponer secretos, alinear Node y dejar configuración reproducible.
2. **T-04:** fijar contratos sobre DTOs frontend reconciliados. T-03a está hecho; su evidencia vive en el plan. **T-03b (CI)** comienza después de T-02 y T-03a. Herramientas locales ya disponibles.
3. **T-05/T-06:** desarrollar auth mínima del ADR y permisos. Una solución propia evita exigir otro proveedor; su seguridad y complejidad se validan antes de elegirla definitivamente.
4. **T-09:** habilitar/configurar storage test con una opción admitida y condiciones compatibles; intervención solo si aparece una necesidad real de conexión, autorización o costo.
5. **T-14:** reutilizar comprobante/contacto por enlaces con datos reales. Implementar/probar contenido y destino correctos; integrar en T-17/T-18. No habilitar Evolution API, VPS, outbox ni jobs de mensajería para este entregable. Si después se solicita E-07, verificar acceso/costos del proveedor en ese momento.
6. **T-22/T-24:** añadir runner/config de E2E y ejecutar suite sobre API/BD aisladas, después sobre deploy identificado. Smoke de browser en esta auditoría no acredita el flujo de compra.

## Reglas de bloqueo y acceso

- El PATH del proceso PowerShell está mal formado y oculta ejecutables instalados. Usar rutas absolutas o PATH corregido solo en el proceso; no requiere intervención ni cambios globales del usuario.
- Un 403 del MCP Vercel no bloquea acciones cubiertas por su CLI. Reconexión del MCP solo si esa vía se vuelve necesaria.
- No solicitar cuentas nuevas de auth/storage/observabilidad ni infraestructura AWS anticipadamente. No hay requisitos actuales de Cognito, DynamoDB, S3 o pasarela.
- Si una acción necesita conectar/autenticar/habilitar recursos o aclaración del usuario, interrumpir esa acción y reportar evidencia, acción mínima e IDs afectados, como pidió el usuario. Guardar checkpoint; sin ciclos de login ni atajos de seguridad.
- Nunca pedir secretos en documentos o salida de herramientas. La API key se configura por un canal seguro y queda fuera de Git/bundles; los prompts solo reciben nombres de variables o referencias.

Modelos, clean code, sesiones y límites de reintento: [orquestación IA](orquestacion-ia.md). La auditoría no modificó cuentas, planes, infraestructura ni configuración global.
