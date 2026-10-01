# Bitácora — Construcción del incremento C1: T-01/T-02 y T-04

> Fecha: 2026-10-01, zona horaria America/Bogota.
> Alcance: implementación local de API/entorno de test y contratos compartidos; continuación autorizada de integración/Preview registrada al final.
> Este registro conserva el proceso para aprendizaje. El estado del proyecto permanece en `docs/tecnicos/estado-plan.md`; no se convierte esta bitácora en otra fuente de tareas.

## Encargo y punto de partida

El usuario pidió leer AGENTS.md, el plan y la estrategia de orquestación; iniciar T-01/T-02 y T-04 en una feature desde develop, respetar dependencias, orquestar Codex/Claude, validar y actualizar el plan. También pidió detener lo dependiente si necesitaba intervenir.

Codex comprobó rama, commits y cambios pendientes. La base de develop era `d384e089139cd83b3e9c422db9f803d92fd72dd9`; creó `feature/base-test-contratos` desde esa base. La bitácora anterior ya existía sin seguimiento: se preservó y no se incorporó incidentalmente a los commits del incremento. El CI T-03b y el acceso T-05 no se iniciaron, porque dependían del entorno T-02 y del contrato T-04.

## Cómo se orquestó

Codex mantuvo la coordinación en este chat: reparto de archivos, restricciones, revisiones, herramientas de validación, integración y documentación. Los ejecutores recibieron encargos acotados, sin todo el historial. Se comprobó autenticación por suscripción: Codex con ChatGPT y Claude Code con claude.ai/Pro firstParty. No se activaron API facturada, créditos adicionales ni resets.

Se eligió `gpt-6.1-sol/high` para API/entornos y `claude-sonnet-5-5/high` para contratos y revisión independiente. Los modelos de ejecutores y el esfuerzo se fijaron explícitamente; no se usaron Luna, Haiku ni delegación recursiva.

El paralelismo se limitó a dos ejecutores con archivos disjuntos. Codex delegado escribió health/configuración/routing y sus pruebas; Claude escribió contratos/domain/persistencia de pedidos y consumidores necesarios. `shared/contracts/`, migración y configuración conservaron un escritor por área. Las ampliaciones a consumidores UI se coordinaron con el orquestador. Los ejecutores no hicieron commits, push, merge ni cambios cloud.

## Cuántas sesiones se utilizaron

El conteo corresponde exclusivamente a este incremento. No incluye los pings, sesión interactiva o interventoría de la bitácora anterior.

| Proveedor / instancia | Sesiones nuevas para el incremento | Reanudaciones | Función |
|---|---:|---:|---|
| Claude Code | **2** | **1** | Implementar/corregir T-04 y revisar T-01/T-02 en solo lectura |
| Codex delegado | **1** | **0** | Implementar/corregir T-01/T-02 como subagente `api_entorno` |
| Codex orquestador | **0 nuevas**; chat existente | Continuación del mismo chat | Coordinar, revisar T-04, validar, corregir detalles finales y documentar |
| Codex CLI externo | **0** | **0** | No se lanzó `codex exec`; el ejecutor fue un subagente de Codex |

Por tanto, hubo **tres sesiones ejecutoras nuevas**, más el chat orquestador ya abierto. Claude tuvo **tres invocaciones de proceso**: inicio de T-04, reanudación de ese mismo ID y nueva revisión independiente. Tres invocaciones no son tres sesiones distintas.

### Claude 1 — Implementación de T-04

Session ID: `73cc8488-e79d-41b8-9c45-e5ab020395e0`. Modelo efectivo: `claude-sonnet-5-5`, esfuerzo high. Se usó modo no interactivo y salida estructurada para capturar el ID real.

Creó DTOs/esquemas/errores comunes en `shared/contracts/`, contrato de estados y sustituciones, validación de teléfono/entrega/GPS/pesos/fechas, cálculo COP y separación de estimado/final. Separó modelo interno de DTO público, adaptó pedidos legacy y handlers y unificó tipos frontend. Preparó migración aditiva `0001` con metadata, sin ejecutarla.

La primera ejecución reportó 110 turnos y 661.177 ms. Cinco solicitudes de herramienta fueron rechazadas por permisos automáticos: Claude no pudo ejecutar sus comprobaciones ni escribir el checkpoint local. Informó el bloqueo y no declaró verificado el bloque. Codex ejecutó los gates por vías disponibles, sin desactivar seguridad.

La corrección relacionada reutilizó **el mismo session ID**, mediante una reanudación explícita. Se limitaron las herramientas a lectura/edición de archivos; Codex conservó los comandos y la escritura del checkpoint. Esta invocación reportó 61 turnos y 152.880 ms, sin solicitudes rechazadas. Los turnos internos del CLI no equivalen a rondas de corrección.

### Codex 1 — Ejecutor API/entornos

Identificador: `/root/api_entorno`; modelo `gpt-6.1-sol`, esfuerzo high. La herramienta expuso un identificador de subagente, no un session ID reanudable de Codex CLI: no se inventó uno.

Implementó health portable con SELECT 1/timeout, HTTP JSON 404/405, routing, configuración lazy, aislamiento test/producción, normalización de endpoints Neon y rechazo de overrides de URL. Alineó Node a 24.x y protegió cliente/migrador/Drizzle, con pruebas de config, health y HTTP. Las ampliaciones de ownership se comunicaron antes de editar. Continuó sus correcciones dentro del mismo ejecutor; no se creó otro agente.

### Claude 2 — Revisión independiente de T-01/T-02

Session ID: `0a5fb688-406d-4b18-ba30-a4676cce6cd1`. Modelo efectivo `claude-sonnet-5-5`, esfuerzo high. Fue una sesión nueva por cambio de función/objetivo, con herramientas de solo lectura y sin comandos ni cloud.

Revisó API, configuración, factory, adapters y pruebas; devolvió cinco hallazgos con severidad y límites. Reportó 26 turnos y 83.384 ms, sin rechazos de permisos. No afirmó validar Vercel ni Neon mediante lectura estática. Terminó después del informe y no necesitó reanudación.

## Rondas de corrección

Se cuentan ciclos de **revisión → encargo correctivo → comprobación**, no llamadas de herramienta ni turnos del modelo. Hubo **dos rondas de revisión/corrección por bloque**, una para T-04 y otra para T-01/T-02, más ajustes locales durante el cierre de gates. No hubo una segunda reanudación de Claude ni un tercer reviewer.

| Ronda | Quién revisó / corrigió | Hallazgos y resolución |
|---|---|---|
| **1 — T-04** | Codex revisó; Claude 1 corrigió en su única reanudación | Reprodujo rechazo de domicilio solo GPS y aceptación de final sin pesos reales; corrigió esquemas y tests. Incorporó validación de salida/IDs y whitelist de DTO. Corrigió etiquetas/tab/contador `in_delivery`, cancelados canónicos y comportamiento de terminales. Codex comprobó metadata Drizzle offline |
| **2 — T-01/T-02** | Claude 2 revisó; Codex corrigió | Cerró acceso remoto con `APP_ENV=local`, Drizzle online sin guard, requisito de NODE_ENV productivo y engines backend. Comprobó SELECT 1 contra Neon real. El posible conflicto de routing se contrastó con el compilador Vercel; la confirmación definitiva se reservó para Preview |

Durante el cierre, Codex corrigió detalles detectados por sus gates: coincidencia ambigua de texto en un test admin, dependencia del effect del simulador y cobertura del fallback con slash final. Fueron ajustes locales, sin nuevas sesiones de IA. El registro no permite asignar un número histórico fiable a cada microedición; se conserva el conteo verificable de dos ciclos cruzados y una reanudación delegada, sin inflarlo con cada test ejecutado.

## Qué se validó y qué quedó pendiente

- Backend/API/shared: typecheck y **268/268 tests** en 15 suites.
- PWA: typecheck explícito, **20/20 tests** y lint sin errores; tres warnings previos.
- Admin: typecheck explícito, **80/80 tests** y lint sin errores; tres warnings previos.
- Typecheck raíz, drift frontend, revisión de diff y build unificado: pasan.
- Drizzle generate sobre copia de metadata ignorada: sin cambios de schema; no se aplicó SQL.
- Health local con handler/adapter real contra Neon dev: HTTP 200, database connected, entorno test. Un sondeo agregado del único pedido dev no encontró incompatibilidades en los campos comprobados; no mostró datos personales ni sustituyó integración persistente.

El build aún fuerza demo y conserva precache de aproximadamente 28.2 MiB. Auth/permisos, autoridad de catálogo/precios/envío, idempotencia, atomicidad y auditoría siguen en sus bloques. Las pruebas locales no acreditan runtime cloud ni la entrega completa.

## Cierre local y pausa dependiente

Codex revisó el diff y guardó dos commits locales: `a577111c4b7665e9de1293564719dfeb2db09022` (implementación) y `92f5696` (plan/registro de sesiones). Actualizó `estado-plan.md`, `ejecucion-ia.json` y la referencia de memoria compartida en `orquestacion-ia.md`. Conservó los logs completos y checkpoint en `.claude/orquestacion/`, ignorados por Git; el registro compartido no contiene credenciales ni transcripts.

Los ejecutores terminaron. El trabajo dependiente se detuvo porque los DATABASE_URL de Preview/Production eran sensitive y no podía determinarse su destino mediante lectura. Se solicitó confirmar Production en Neon main y autorizar incorporar/publicar/configurar Preview dev/maui, verificando aislamiento antes de la migración aditiva. Hasta ese cierre no hubo push, merge, deploy, migración, seed/reset ni modificaciones productivas.

## Continuación autorizada

El usuario respondió «sí» a la confirmación de Production en main y a la propuesta concreta de integración/publicación/Preview dev/maui con migración posterior a verificar aislamiento. Además solicitó esta bitácora. Codex continúa desde el mismo chat; esta ampliación documental y el despliegue no añaden sesiones Claude ni ejecutores Codex. La autorización permite el incremento de test; no promoción a master/Production ni inicio de nuevos bloques.

Los resultados de integración y cloud se añaden aquí al concluir. Se mantiene esta sección separada del cierre local para no atribuir retrospectivamente un deployment o migración a las sesiones de implementación.
