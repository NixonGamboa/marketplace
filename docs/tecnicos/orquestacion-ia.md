# MAUI — Orquestación de Codex y Claude Code

> **Fecha:** 2026-10-01. **Alcance:** estrategia de ejecución técnica del [plan global](estado-plan.md), T-01 a T-24 y evolución posterior cuando se solicite.
> **Responsable de orquestación:** Codex en este chat. Implementación mediante asistentes locales autenticados por suscripción; sin workflow SDD.

## Capacidad comprobada y límites

Versiones, autenticación, accesos y pruebas de los asistentes se registran en la [auditoría de capacidades](auditoria-herramientas.md). Este documento mantiene decisiones de orquestación y aprendizajes, sin duplicar el registro de pruebas. Un conector puede sustituirse por CLI/API autenticado cuando cubra la misma acción y alcance; su presencia no prueba permisos.

Las cuotas de Codex y Claude son independientes entre proveedores, pero varias sesiones del mismo proveedor comparten la capacidad de su cuenta. Codex Plus depende del modelo/contexto/tarea y puede tener ventanas de cinco horas y semanales. Claude comparte uso entre Claude y Claude Code. Abrir/reanudar una sesión o compactar contexto no reinicia esas cuotas. No interpretar counters de tokens o estimaciones de costo de sesión como factura de la suscripción.

Usar autenticación por suscripción. Antes de lanzar procesos, comprobar auth y evitar claves/configuraciones que cambien a facturación API. No activar créditos/uso adicional, comprar capacidad ni modificar planes. Las comprobaciones de auth no garantizan que una tarea de modelo vaya a ejecutarse: el primer bloque acotado servirá para comprobar ejecución, permisos y respuesta del CLI.

## Gitflow y separación de entregas

**Política única:** esta sección concilia las reglas introducidas en `5c9855c49890cab3b44e4135b5a04eed459bb845`, originalmente duplicadas en AGENTS.md y CLAUDE.md: desarrollo directo, rama `feature/<nombre>` desde develop y verificación en esa rama, sin desarrollar directamente en develop/master. AGENTS.md, CLAUDE.md y README remiten aquí; no mantienen otro gitflow. `estado-plan.md` mantiene estados/dependencias, no una política de ramas paralela.

1. **Base:** revisar rama, commit y cambios pendientes antes de asignar un bloque. Resolver primero diferencias con features existentes, según la prioridad 0 del plan; que un Preview esté listo no demuestra que su código pertenezca a develop.
2. **Desarrollo:** una feature desde develop para cada capacidad o grupo coherente de T-*. Contratos/config/migraciones tienen un escritor único. Asignar ownership de archivos; no mover ni incluir cambios ajenos con un `add` global o stash indiscriminado.
3. **Separación documental:** documentación del plan en `docs/plan-implementacion-directa` desde develop, excepción explícita solicitada por el usuario al patrón feature de producto. Presentación en `feature/ajustes-presentacion-leche-y-miel`. Otros cambios técnicos usan su feature; no mezclar entregas distintas en un commit.
4. **Integración:** revisar diff contra develop y ejecutar verificaciones del alcance; presentar propuesta total/parcial si hay trabajo pendiente de otra rama. Fusionar/incorporar únicamente con aprobación explícita donde la solicitud la exige. Resolver conflictos con el estado vigente y actualizar H-*/T-* después de incorporar/verificar lo aprobado.
5. **Entornos:** feature → develop → Preview validado → master/Production solo cuando se autorice esa promoción. El entregable actual es test; no requiere promover master. Un push puede generar un deploy: no incluirlo implícitamente en una aprobación de commits locales.
6. **Sesiones aisladas:** si hay solapamiento, trabajar en checkout/worktree separado después de resolver la base y autorización aplicable; registrar rama/commit/session ID. Integrar por diff/commits seleccionados, preservando cambios ajenos.

### Separación aprobada el 2026-10-01

El usuario aprobó los commits locales por alcance y la incorporación parcial de nueve commits funcionales. Se verificó primero el conjunto de código, se incorporó a develop y se separaron documentación y presentación. La aprobación excluye push y promoción a producción.

| Orden ejecutado | Rama destino | Alcance y evidencia |
|---|---|---|
| 1 | `feature/integracion-checkout-contacto-pesos` → develop | Nueve cherry-picks funcionales más corrección localizada de dos declaraciones de tipos; `e5670671f404eb29e849a4eb13d68bb2c9f485e4`. Gate y exclusiones en el plan |
| 2 | `feature/ajustes-presentacion-leche-y-miel` | Commit `b95a0f23fe543f865268f5000c141fe7dcc01753`: presentación PPTX, documento del piloto y 24 archivos de `.codex-build-presentation/`; 26 archivos en total, sin documentos del plan |
| 3 | `docs/plan-implementacion-directa` desde develop reconciliado (`e567067`) | `AGENTS.md`, `CLAUDE.md`, `MAUI-PWA-customers/CLAUDE.md`, `README.md`, `docs/tecnicos/estado-plan.md`, `adr-001-stack-backend.md`, `orquestacion-ia.md`, `auditoria-herramientas.md`; .gitignore raíz con `/node_modules/` y una sola entrada `.claude/`. Nueve archivos; sin assets de presentación |

Los conjuntos se preservan mediante worktrees aislados y traslado selectivo verificado. Cada commit incluye únicamente sus archivos asignados; se revisa el diff staged antes de confirmar. Los registros históricos ajenos a esta separación se conservan fuera de estos commits y de las referencias activas del plan. El usuario autorizó posteriormente incorporar `docs/plan-implementacion-directa` a develop el 2026-10-01; la incorporación local por fast-forward incluye el commit documental `1a54b6f` y esta actualización de cierre. Las nuevas features desde develop heredan el plan y las instrucciones vigentes. Esta incorporación no despliega ningún artefacto ni autoriza push o promoción a producción.

## Reparto de trabajo

| Función | Ejecutor preferido | Contexto que recibe |
|---|---|---|
| Ordenar dependencias, fijar contrato mínimo y repartir archivos | Codex orquestador | Plan vigente, estado del repo y resultado breve del último bloque |
| Implementación habitual de endpoints/adapters/UI y tests asociados | Un ejecutor Claude Code o Codex CLI según margen disponible | Encargo de una capacidad, archivos permitidos, contratos relevantes y pruebas esperadas |
| Auth, permisos, importes/pesos, idempotencia y concurrencia | Ejecutor con capacidad suficiente; revisión independiente del otro proveedor | Decisión concreta, diff, contrato y riesgo que debe verificar |
| Lint/typecheck/tests/build | Herramientas locales, coordinadas por Codex | Comandos y resultado; sin un segundo modelo leyendo logs completos |
| Integración, comprobación de alcance y actualización de estado | Codex orquestador | Diff y evidencia de pruebas; leer código afectado según riesgo |

No fijar un reparto 50/50 ni duplicar implementación para comparar asistentes. La asignación inicial favorece que Claude resuelva implementación acotada mientras Codex conserva margen para coordinación y validación; cambiarlo según límites/resultado real. Elegir modelo y esfuerzo por bloque mediante la matriz siguiente, sin cambiar preferencias globales ni intentar saltarse límites con otro modelo.

## Modelos y esfuerzo por complejidad

**Exclusión obligatoria:** ninguna variante Luna de Codex ni Haiku de Claude, incluidos subagentes, fallbacks y sesiones reanudadas. No usar selección automática que pueda resolver a una familia excluida. Para optimizar consumo se reduce contexto, alcance y esfuerzo; se conserva la capacidad del modelo.

| Tipo de trabajo | Codex | Claude Code | Aplicación en el plan |
|---|---|---|---|
| Edición mecánica, documentación o corrección localizada con causa conocida | `gpt-6.1-sol`, `low` | Sonnet, `low` | Cambios pequeños dentro de un bloque; subir a `medium` si cambia comportamiento |
| Implementación habitual con contratos estables | `gpt-6.1-sol`, `medium` | Sonnet, `medium` | CRUD T-07/T-08; comprobante/enlaces T-14; adapters/UI T-17/T-18; polling T-19; parte habitual de seed/storage/observabilidad |
| Integración y reglas con riesgo de seguridad o pérdida de datos | `gpt-6.1-sol`, `high` | Sonnet, `high`; Opus, `medium` para análisis más complejo | Entornos y CI T-01–T-03; contratos/auth T-04–T-06; permisos/paginación T-11; audit T-13; pruebas T-15/T-22; caché privada T-20; despliegue/cierre T-23/T-24 |
| Precios/pesos, idempotencia, estados y concurrencia | `gpt-6.1-sol`, `xhigh` para diseñar y resolver; `high` con decisión estable | Opus, `high`; Sonnet, `high` para implementación ya delimitada | T-10/T-12; revisión de reset seguro T-16, uploads T-09 y restauración T-21 según riesgo |
| Diagnóstico difícil o decisión transversal aún no resuelta con evidencia | `gpt-6-astra`, `high`; `xhigh` si persiste dificultad justificada | Opus, `high`; `xhigh` si el modelo lo admite y aporta valor | Escalación acotada de cualquier T-*; volver al modelo base al cerrar la decisión |

Modelo base Codex: **GPT-6.1 Sol** (`gpt-6.1-sol`), ya presente en la configuración local. Alternativa si no está disponible: GPT-6 Sol (`gpt-6-sol`) con esfuerzo adecuado; no migrar por defecto a modelos anteriores. **Astra** (`gpt-6-astra`) queda reservado a problemas que justifican su mayor consumo. [Selección y esfuerzo de Codex](https://learn.chatgpt.com/docs/models).

Familias Claude: **Sonnet** para ejecución habitual y **Opus** para razonamiento complejo. Para este plan, la referencia vigente es **5.5 en ambas familias**. Sonnet 5.5 (`claude-sonnet-5-5`) respondió al ping real con `low`; Opus 5.5 (`claude-opus-5-5`) sigue sujeto a comprobar acceso incluido en la cuenta. La documentación vigente admite `low`, `medium`, `high`, `xhigh` y `max` en estas versiones y la CLI instalada cumple su versión mínima; el ping no prueba los demás esfuerzos ni modelos. [Modelos y niveles de Claude Code](https://code.claude.com/docs/en/model-config).

**Selección por familia, sin quemar versiones:** 5.5 es la referencia conocida de este plan, no un ID permanente incrustado en scripts, helpers o lógica del proyecto. La ejecución habitual puede seleccionar `--model sonnet` o `--model opus` para resolver la versión actual de la familia en el proveedor autenticado; los aliases no garantizan la misma versión en todos los proveedores. Confirmar el ID canónico realmente usado y registrarlo por sesión. Usar un ID completo solo cuando haga falta reproducibilidad, diagnóstico o mantener estable un bloque ya iniciado. Una nueva versión se incorpora por disponibilidad incluida, compatibilidad y utilidad para la tarea; no generar pings/revisiones repetidos solo por novedad ni cambiar el modelo a mitad de un bloque sin razón. Mantener las exclusiones Luna/Haiku y evitar defaults/fallbacks que salgan de las familias elegidas.

Un mismo nombre de esfuerzo no equivale al mismo consumo/capacidad entre modelos. No heredar `high` global para tareas mecánicas: pasar selección explícita por sesión, comprobar restricciones/env y registrar el nivel efectivo. `max` solo para un problema excepcional con hipótesis y límite de alcance; no activar Ultra/Ultracode ni equipos recursivos como default. Si un modelo no está incluido, usar una alternativa permitida incluida que resuelva el bloque; si exige conexión/auth o un cambio de alcance, interrumpir y avisar. No activar API de pago, uso extra ni créditos para desbloquearlo.

Revisión independiente de contratos, auth, importes y concurrencia: proveedor distinto con `high`, sobre diff y evidencia concreta; `xhigh` solo cuando el riesgo lo justifique. Una revisión crítica no obliga a mantener todo el ejecutor en esfuerzo máximo.

## Clean code como criterio de cierre

- Funciones/componentes con responsabilidad clara, nombres de dominio y dependencias explícitas. Separar UI, HTTP, casos de uso y adapters; handlers delgados y reglas independientes de Vercel para facilitar Lambda.
- Validar entradas en las fronteras del sistema; contratos tipados, dinero/unidades/fechas coherentes y errores explícitos. No ocultar fallos con `any`, casts indiscriminados, silencios o mocks de emergencia.
- Evitar duplicación de reglas y efectos ocultos. Extraer abstracciones cuando exista una necesidad real; no añadir capas, frameworks o generalizaciones por anticipación.
- Cambios pequeños y revisión del diff; retirar código muerto generado por el cambio. Respetar convenciones existentes, conservación de datos y cambios ajenos.
- Pruebas de comportamientos y límites relevantes: permisos, cálculos, errores, reintentos y concurrencia. Typecheck/lint y comprobaciones del bloque deben pasar; ninguna cobertura/longitud arbitraria sustituye evidencia funcional.

Cada encargo exige estas reglas y su revisión antes del cierre. Hallazgos fuera del bloque se registran con prioridad y dependencia; no iniciar una refactorización global incidental.

## Tamaño de bloque y paralelismo

Unidad normal: una capacidad verificable, generalmente uno o dos IDs `T-*` relacionados. Dividir contratos, auth y pedidos complejos en incrementos; no enviar al ejecutor «implementar todo MAUI». Agrupar cambios mecánicos del mismo dominio para amortizar la carga inicial de contexto, manteniendo criterios de cierre claros.

Default: orquestador + **un ejecutor activo**. Permitir un segundo ejecutor solo con dependencias satisfechas y archivos/dominios disjuntos; máximo dos ejecutores además del orquestador. Contratos `shared/`, migraciones y configuración se terminan antes de repartir consumidores. Evitar delegación recursiva salvo justificación concreta.

Prioridad 0 y T-03a están completados. Primer lote técnico posterior: comprobar API/entornos (T-01/T-02) y fijar contratos (T-04), repartiendo archivos únicamente si sus dependencias y ownership lo permiten. T-03b (CI) espera T-02; no repetir checkout/lint ya verificados. T-04 se fija antes de auth y consumidores. Con backend/contrato estables, T-17/T-18 pueden repartirse por carpetas; cambios de contrato vuelven a un escritor único.

Un solo escritor por archivo. Para solapamiento inevitable usar checkout/worktree aislado y revisar/integrar su diff antes de continuar. Antes de ejecutar registrar archivos asignados y cambios preexistentes; ningún asistente revierte trabajo ajeno. Un reviewer recibe solo lectura y evidencia independiente; no modifica en paralelo el código que revisa.

## Administración de sesiones

1. Preparar encargo corto: objetivo, IDs, estado relevante, archivos propios, interfaces, restricciones y comandos de validación. Objetivo orientativo: 300–600 palabras más referencias a archivos; no incluir historial del chat ni todo el plan.
2. Iniciar Claude en modo no interactivo o `codex exec`, con permisos/herramientas adecuados al encargo. Elegir flags del `--help` instalado: documentación reciente puede describir flags inexistentes en estas versiones.
3. Capturar ID explícito de sesión mediante salida estructurada; registrar proveedor, ID, IDs del plan, estado y ubicación del resultado. No usar `--last`/`--continue` sin ID en un repo con sesiones simultáneas.
4. Reanudar ese ID para la corrección del mismo bloque, conservando contexto útil. Sesión nueva al cambiar dominio/objetivo, al cerrar un bloque o cuando el historial aporta ruido; no reiniciar tras cada pequeña corrección ni fragmentar excesivamente trabajo relacionado.
5. Antes de compactar o cambiar proveedor, guardar checkpoint: archivos cambiados, decisiones, pruebas, fallo exacto y próximo paso. Transferir ese resumen y referencias, no transcript completo ni logs de herramientas.
6. Pedir devolución breve: resultado, archivos, validación, limitaciones y próximos pasos. Orquestador inspecciona diff y ejecuta comprobaciones. Cerrar procesos al terminar; no dejar ejecutores sin tarea ni lanzar sesiones completas solo para responder una duda mínima.

Comandos comprobados para recuperación: `claude --resume <session_id>` y `codex exec resume <session_id>`. La disponibilidad de reanudar el chat orquestador desde otro proceso no se presupone: su estado recuperable debe estar en el repo.

Usar modo no interactivo para encargos autosuficientes con devolución estructurada; el modo interactivo está disponible para instrucciones sucesivas y observación del terminal dentro de un bloque. Los IDs de proceso/PTY de las herramientas son temporales y no sustituyen al session ID de Claude. Al reanudar, volver a fijar modelo/esfuerzo y restricciones del encargo. En ambos modos se aplican checkpoint, cierre de ejecutores y aviso al usuario ante conexión/auth necesarias.

### Aprendizajes de las pruebas de Claude desde Codex

Las dos ejecuciones reales validaron acceso a Sonnet 5.5 y control del proceso en ambos modos. Las próximas interacciones aprovechan esa evidencia sin repetir pruebas de acceso antes de cada encargo.

| Evidencia / aprendizaje | Aplicación del orquestador |
|---|---|
| Ping no interactivo devolvió `PONG`, modelo canónico y uso en JSON | Modo no interactivo por defecto para un encargo concreto. Leer resultado, estado de error, modelo real, session ID y métricas disponibles; no basarse solo en el modelo solicitado |
| Ping mínimo usó 460 tokens de entrada y 5 de salida, sin herramientas/subagentes | Perfil de diagnóstico con prompt breve y herramientas/MCP innecesarios deshabilitados. Ese consumo solo describe el ping; no estima una implementación |
| Terminal interactivo aceptó stdin y mostró `PONG` | Usar interacción cuando aporte instrucciones sucesivas/observación dentro del mismo bloque; controlar espera y cierre del proceso |
| `--disable-slash-commands` dejó `/exit` como comando desconocido | En ese perfil, cerrar con dos Ctrl-C consecutivos y verificar terminación. No repetir comandos de cierre que ya fallaron ni asumir que todos los perfiles admiten los mismos comandos |
| Sesión interactiva conservó ID; el ping con `--no-session-persistence` no | Persistir sesiones de implementación para correcciones relacionadas; sesión efímera para un diagnóstico que no necesita continuidad. Guardar ID y checkpoint, no reconstruir todo el contexto |
| CLI y modelos se ejecutaron con auth de suscripción y parámetros explícitos | Seleccionar familia/esfuerzo por tarea, conservar la vía de suscripción y registrar el modelo resuelto. Comprobar nuevamente acceso si aparece un fallo o se necesita otro modelo, dentro de límites de reintento |

**Perfil de implementación:** encargo mínimo suficiente con objetivo, archivos propios, contratos, instrucciones del proyecto/clean code, herramientas necesarias y validación esperada. El system prompt mínimo y las restricciones del ping son para diagnóstico: no trasladarlos íntegramente a una implementación si eliminan instrucciones o capacidades necesarias. Cargar configuración y contexto del área de forma deliberada, sin activar todos los conectores por costumbre.

**Límites de lo aprendido:** no se midió el consumo interactivo ni se compararon modos sobre la misma tarea. No afirmar que uno ahorra más tokens por sí mismo. Tampoco se probó todavía la reanudación efectiva ni Opus 5.5/otros esfuerzos. Comprobar esas capacidades cuando un bloque las necesite, sin consumir cuota solo para completar una matriz de pruebas. El ahorro se busca en encargos acotados, contexto relevante, esfuerzo adecuado y continuidad útil.

### Cierre, inactividad y consumo de capacidad

**Política:** conservar los chats y sesiones guardadas; cerrar los procesos ejecutores cuando su tarea termine o quede bloqueada. No cerrar y recrear la sesión después de cada interacción del mismo bloque.

| Situación | Acción |
|---|---|
| Ejecutor trabajando en un bloque | Mantenerlo durante el trabajo autorizado; controlar alcance y resultado |
| Bloque terminado | Guardar resultado/checkpoint e ID; cerrar el ejecutor y comprobar que sus agentes o tareas en segundo plano terminaron |
| Bloque esperando acceso o respuesta del usuario | Guardar fallo, evidencia y próximo paso; detener el trabajo dependiente y cerrar el ejecutor si no tiene otra tarea autorizada |
| Corrección relacionada con el mismo bloque | Reanudar por ID, reutilizando contexto relevante |
| Nuevo dominio o historial con mucho ruido | Iniciar sesión nueva con checkpoint y referencias mínimas |
| Chat o historial guardado para consulta | Conservarlo; no equivale a mantener un ejecutor generando solicitudes |

El consumo depende de solicitudes y actividad efectivas, además del contexto procesado. Claude Code documenta pequeñas solicitudes en segundo plano incluso estando inactivo, y mayor actividad si hay tareas programadas, agentes u otras funciones activas. Conservar una ventana abierta no garantiza consumo cero. [Actividad en segundo plano de Claude Code](https://code.claude.com/docs/en/costs#background-token-usage).

Una nueva solicitud en una sesión larga puede volver a procesar mucho historial; la caché reduce parte del costo, pero puede expirar. Cerrar y reabrir reanudando el mismo historial no elimina ese contexto. Para trabajo distinto, usar sesión nueva; compactar solo cuando conservar continuidad aporta valor, porque la compactación también procesa contenido. [Contexto y consumo en Claude Code](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session). Codex también recomienda limitar contexto, archivos e instrucciones para aprovechar la capacidad. [Uso eficiente de Codex](https://learn.chatgpt.com/docs/pricing#what-can-i-do-to-make-my-usage-limits-last-longer).

**Cerrar procesos, borrar chats, iniciar sesión nueva o compactar no recupera capacidad ya consumida ni reinicia cuotas de la cuenta.** El ahorro principal se busca en ejecuciones acotadas, contexto relevante y cierre de ejecutores sin tarea. No asumir que cerrar una ventana cancela una automatización independiente: al finalizar el encargo comprobar su estado y detener únicamente la actividad que pertenezca a ese encargo.

El cierre conserva archivos/diff, ID de sesión, modelo/esfuerzo, pruebas, bloqueante y siguiente acción en el checkpoint. No borrar historial ni finalizar sesiones ajenas como medida de ahorro. En suscripción, una estimación monetaria de tokens no se interpreta como un cobro adicional.

## Memoria compartida mínima

El plan global conserva estados/dependencias; este archivo conserva la estrategia, sin duplicar el plan. Al ejecutar el primer bloque se añade un registro compacto `docs/tecnicos/ejecucion-ia.json` con sesiones reales. No existe todavía y no se inventan IDs ni tareas en curso.

Registro por bloque: ID, proveedor/ejecutor, **modelo exacto y esfuerzo efectivo**, session ID, estado, archivos/checkout, referencia de versión, pruebas, bloqueantes, resumen y siguiente acción. Tokens/duración solo cuando el CLI los exponga; cuotas Codex y margen Claude solo si se obtuvieron de una fuente verificable. No guardar credenciales, transcripts completos ni errores con secretos. Los checkpoints son comunicación entre agentes, no specs ni aprobaciones SDD.

Encargo reutilizable: «Resuelve [IDs/objetivo]. Tu responsabilidad son [archivos]. No estás solo en el repo: conserva cambios ajenos y coordina cualquier edición fuera de tu alcance. Usa [contratos/referencias]. Cierre: [comportamiento/pruebas]. Devuelve archivos cambiados, pruebas, bloqueantes y siguiente paso; no leas documentación ajena al bloque salvo necesidad».

## Validación y presupuesto

Buscar/leer archivos concretos y limitar logs a fallos accionables. Mantener instrucciones comunes pequeñas; cargar contexto de dominio solo cuando se utiliza. Tests/lint/typecheck son evidencia principal. Revisión cruzada por otro modelo para auth, totales, estados/concurrencia y cambios compartidos; para cambios simples bastan diff y comprobaciones adecuadas. No repetir todas las suites después de un cambio documental ni repetir revisiones aprobadas sin nueva razón. Build y E2E completos al integrar un corte y en la entrega test final.

Intentar como máximo dos rondas de corrección sobre el mismo fallo antes de cambiar a diagnóstico explícito: evidencia nueva, hipótesis verificable y corrección acotada. No repetir el mismo intento esperando otro resultado, escalar sin diagnóstico ni trasladar errores entre proveedores sin entenderlos.

**Interrupción por bloqueo, solicitada por el usuario:** si hace falta una respuesta que afecte alcance/negocio, conectar una herramienta, autenticar o habilitar acceso externo, detener el trabajo dependiente y avisar de inmediato. Preservar diff y checkpoint; explicar bloqueo, evidencia, intentos, acción mínima del usuario e IDs afectados. Se puede terminar documentación/comprobaciones independientes, pero no presentar el bloque como cerrado ni continuar la acción bloqueada sin respuesta. Resolver primero rutas seguras ya disponibles, como CLI autenticado en lugar de un MCP con scope insuficiente.

Ante 401/403 confirmado de la única vía, login requerido, cuota agotada sin alternativa incluida, credenciales faltantes o servicio no habilitado: no insistir con reautenticaciones ni crear cuentas/planes por cuenta propia. No desactivar seguridad, cambiar proveedor silenciosamente ni sustituir integración real por mock para cerrar la tarea. Una decisión técnica local con requisitos suficientes se resuelve autónomamente; una elección que cambia alcance o requiere al usuario se eleva con alternativas concretas.

Antes de cada lote consultar cuota Codex desde la app; para Claude usar el estado de uso que esté realmente disponible o el aviso de límite del CLI. Hoy se verificó auth/plan Claude, **no su porcentaje restante**. Reservar orientativamente 20–25% de la capacidad disponible de Codex para integración, reparación y reporte; es una política de gestión, no una cuota exacta ni garantía. Reducir paralelismo y encargos al acercarse a los límites.

Si Claude agota capacidad, continuar trabajo acotado con Codex mientras exista margen. Si Codex se acerca al límite, priorizar checkpoint/integración y dejar a Claude únicamente el encargo autosuficiente ya autorizado; no prometer supervisión Codex durante su bloqueo. Si ambos se agotan, guardar estado y reportar la limitación y el reset conocido. No consumir resets de cuenta ni comprar créditos automáticamente. La continuidad después de cerrar el chat o agotar la sesión no se da por garantizada.

## Fuentes verificadas el 2026-10-01

- [Codex: planes y límites](https://learn.chatgpt.com/docs/pricing): la capacidad depende del modelo/tarea y es compartida entre sesiones.
- [Codex: ejecución no interactiva y resume](https://learn.chatgpt.com/docs/non-interactive-mode).
- [Claude Code: manejo de contexto y costos](https://code.claude.com/docs/en/costs): contexto acotado, sesiones relacionadas y equipos pequeños.
- [Claude Code: CLI y resume](https://code.claude.com/docs/en/cli-reference).
- [Claude Code con Pro/Max](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan): uso compartido y diferencia entre autenticación por suscripción y API.
