# MAUI — Orquestación de Codex y Claude Code

> **Fecha:** 2026-10-02. **Alcance:** estrategia de ejecución técnica del [plan global](estado-plan.md), T-01 a T-24 y evolución posterior cuando se solicite.
> **Responsable de orquestación:** Codex en este chat. Implementación mediante asistentes locales autenticados por suscripción; sin workflow SDD.

## Capacidad comprobada y límites

Versiones, autenticación, accesos y pruebas de los asistentes se registran en la [auditoría de capacidades](auditoria-herramientas.md). Este documento mantiene decisiones de orquestación y aprendizajes reutilizables, sin duplicar el registro de pruebas ni la evidencia de cada bloque (vive solo en el [plan](estado-plan.md)). Un conector puede sustituirse por CLI/API autenticado cuando cubra la misma acción y alcance; su presencia no prueba permisos.

Las cuotas de Codex y Claude son independientes entre proveedores, pero varias sesiones del mismo proveedor comparten la capacidad de su cuenta. Codex Plus depende del modelo/contexto/tarea y puede tener ventanas de cinco horas y semanales. Claude comparte uso entre Claude y Claude Code. Abrir/reanudar una sesión o compactar contexto no reinicia esas cuotas. No interpretar counters de tokens o estimaciones de costo de sesión como factura de la suscripción.

Usar autenticación por suscripción. Antes de lanzar procesos, comprobar auth y evitar claves/configuraciones que cambien a facturación API. No activar créditos/uso adicional, comprar capacidad ni modificar planes.

## Gitflow y separación de entregas

**Política única y vigente.** AGENTS.md, CLAUDE.md y README remiten aquí; no mantienen otro gitflow. `estado-plan.md` mantiene estados/dependencias, no una política de ramas paralela. Desarrollo directo en `feature/<nombre>`; nunca directamente en develop/master.

1. **Base:** revisar rama, commit y cambios pendientes antes de asignar un bloque. Una feature por bloque, siempre desde develop. Un solo PR por bloque, incluyendo implementación, correcciones, evidencia y estado; si el smoke exige código ya integrado, actualizar ese mismo PR con el resultado y registrar el cierre documental en el siguiente bloque, sin crear un PR de cierre separado. Un Preview listo no demuestra que su código pertenezca a develop.
2. **Ownership:** contratos/config/migraciones tienen un escritor único. Asignar archivos; no mover ni incluir cambios ajenos con un `add` global o stash indiscriminado. No mezclar entregas distintas en un commit.
3. **Autonomía:** revisión, fixes locales, push de la feature, PR a develop y merge a develop se ejecutan **sin pedir permiso** cuando los gates del alcance están aprobados y el CI del PR está verde. Claude revisa su diff contra develop y ejecuta las verificaciones antes del PR. Codex revisa CI y resumen en bloques no críticos; T-12, T-13 y el reset de T-16 requieren revisión cruzada Codex antes del merge. Resolver conflictos con el estado vigente y actualizar H-*/T-* tras incorporar lo verificado.
4. **CI obligatorio:** no se fusiona con CI rojo, pendiente ni omitido; no saltar checks, usar bypass de administrador ni forzar pushes sobre ramas compartidas. Un fallo de CI se diagnostica y corrige en la feature.
5. **Requieren aprobación del usuario únicamente:** (a) promoción a master/Production; (b) operaciones cloud destructivas (borrado, reset, seed sobre datos existentes, migraciones destructivas); (c) bloqueos que exigen al usuario: decisión de alcance/negocio, conexión, autenticación o habilitación de acceso. La aprobación de una de estas acciones no se extiende a otra.
6. **Sin cambios productivos implícitos:** un push o merge a develop puede generar un Preview, pero no toca Production, su BD, variables ni secretos. Las acciones cloud no destructivas sobre test (Preview/develop, Neon dev) siguen esta política solo después de comprobar el aislamiento del destino.
7. **Entornos:** feature → develop (PR con CI) → Preview validado → master/Production solo con la aprobación del punto 5(a). El entregable actual es test; no requiere promover master.
8. **Descripción de PR:** secciones fijas: Resumen; lista de mejoras funcionales; lista de mejoras no funcionales; Validación con un único enlace al reporte final de evidencia; Limitaciones. No se inventa el enlace: si el reporte aún no está publicado y verificado, se indica como pendiente y se completa después.
9. **Sesiones aisladas:** si hay solapamiento, trabajar en checkout/worktree separado; registrar rama/commit/session ID. Integrar por diff/commits seleccionados, preservando cambios ajenos. La limpieza de ramas/worktrees/stash la realiza el orquestador.

### Aprendizajes reutilizables

1. **Sesiones Claude desde Codex:** modo no interactivo con salida estructurada por defecto; capturar session ID, modelo efectivo y esfuerzo realmente aceptado, y reanudar ese ID para correcciones del mismo bloque. Un ping de diagnóstico (prompt mínimo, herramientas deshabilitadas, `--disable-slash-commands` que exige dos Ctrl-C para cerrar) no se traslada íntegro a una implementación. Si los permisos automáticos deniegan una escritura (p. ej. checkpoint en `.claude/`), no reintentar ni relajar seguridad: el orquestador registra el checkpoint. Con helpers de cloud, el ejecutor lo deja en un directorio temporal fuera del repo, lo valida localmente y el orquestador lo revisa y lo copia a su ruta. No se midió el consumo interactivo ni se compararon modos: no afirmar ahorros sin medir. **Cuotas durante la ejecución:** consultar estos datos durante el bloque y antes de ampliar el encargo, sin abrir sesiones extra solo para medir. Aprovechar los eventos de uso de la sesión activa, registrar fuente y hora, y ajustar la asignación según el margen disponible de cada proveedor.
2. **Verificar en el destino real:** comprobar filesystem/local no bastó para rutas dinámicas; exigir smoke sobre un deployment identificado (SHA, ref, entorno) antes de cerrar un bloque cloud. Si un MCP carece de scope, usar el CLI autenticado diagnosticando antes de cambiar la vía; en Vercel CLI 56.1, `api --input` requiere objetos individuales y `curl` URL completa con cwd de proceso.
3. **Reproducibilidad de CI y migraciones:** generar locks con la versión de Node/npm de CI y comprobarlos en Linux (peers omitidos por un lock Windows/npm distinto rompieron el primer run); comparar hashes de migraciones con contenido canónico LF en Windows; ejecutar los gates explícitos de tipos/lint/tests/drift antes del build.

## Reparto de trabajo

| Función | Ejecutor por defecto | Responsabilidad |
|---|---|---|
| Implementación y cierre técnico del bloque | Claude Code | Implementar, correr tests y gates, aplicar correcciones, preparar smoke y evidencia, redactar el PR y el resumen |
| Asignación e integración | Codex | Medir cuotas, asignar bloque y archivos, tomar decisiones transversales y hacer merge con CI verde |
| Bloques críticos: T-12, T-13 y reset de T-16 | Codex | Revisión cruzada del diff y evidencia antes del merge |
| Bloques no críticos | Codex | Revisar CI y resumen; investigar únicamente fallos, bloqueos o discrepancias concretas |

El reparto se ajusta en cada asignación según cuota medida, ventanas y hora, sin porcentajes fijos ni reparto 50/50. Si Codex tiene poco margen, se limita a merge y revisiones críticas y encarga a Claude trabajo mayor, hasta dos bloques relacionados por sesión con un PR por bloque. Si Claude tiene poco margen, Codex ejecuta solo arreglos pequeños; no inicia un bloque grande sin capacidad para terminarlo. Máximo dos ejecutores Claude, en carpetas disjuntas y checkouts/worktrees separados si se solapan en el repositorio. Contratos y estados de pedido tienen un escritor único. Elegir modelo y esfuerzo por bloque mediante la matriz siguiente.

## Modelos y esfuerzo por complejidad

**Exclusión obligatoria:** ninguna variante Luna de Codex ni Haiku de Claude, incluidos subagentes, fallbacks y sesiones reanudadas. No usar selección automática que pueda resolver a una familia excluida. Para optimizar consumo se reduce contexto, alcance y esfuerzo; se conserva la capacidad del modelo.

| Tipo de trabajo | Codex | Claude Code | Aplicación en el plan |
|---|---|---|---|
| Edición mecánica, documentación o corrección localizada con causa conocida | `gpt-6.1-sol`, `low` | Sonnet, `low` | Cambios pequeños dentro de un bloque; subir a `medium` si cambia comportamiento |
| Implementación habitual con contratos estables | `gpt-6.1-sol`, `medium` | Sonnet, `medium` | CRUD T-07/T-08; comprobante/enlaces T-14; adapters/UI T-17/T-18; polling T-19; parte habitual de seed/storage/observabilidad |
| Integración y reglas con riesgo de seguridad o pérdida de datos | `gpt-6.1-sol`, `high` | Sonnet, `high` | Entornos y CI T-01–T-03; contratos/auth T-04–T-06; permisos/paginación T-11; audit T-13; pruebas T-15/T-22; caché privada T-20; despliegue/cierre T-23/T-24; reset seguro T-16, uploads T-09 y restauración T-21 |
| Precios/pesos, idempotencia, estados y concurrencia | `gpt-6.1-sol`, `xhigh` para diseñar y resolver; `high` con decisión estable | Opus, `high`; Sonnet, `high` para implementación ya delimitada | T-10/T-12 |
| Diagnóstico difícil o decisión transversal aún no resuelta con evidencia | `gpt-6-astra`, `high`; `xhigh` si persiste dificultad justificada | Opus, `high`; `xhigh` si el modelo lo admite y aporta valor | Escalación acotada de cualquier T-*; volver al modelo base al cerrar la decisión |

Modelo base Codex: **GPT-6.1 Sol** (`gpt-6.1-sol`), ya presente en la configuración local. Alternativa si no está disponible: GPT-6 Sol (`gpt-6-sol`) con esfuerzo adecuado; no migrar por defecto a modelos anteriores. **Astra** (`gpt-6-astra`) queda reservado a problemas que justifican su mayor consumo. [Selección y esfuerzo de Codex](https://learn.chatgpt.com/docs/models).

Familias Claude: **Sonnet** para ejecución habitual y **Opus** para razonamiento complejo. Para este plan, la referencia vigente es **5.5 en ambas familias** (`claude-sonnet-5-5`, `claude-opus-5-5`). La documentación vigente admite `low`, `medium`, `high`, `xhigh` y `max` en estas versiones; confirmar acceso incluido en la cuenta cuando un bloque lo requiera, sin consumir cuota para completar una matriz de pruebas. [Modelos y niveles de Claude Code](https://code.claude.com/docs/en/model-config).

**Selección por familia, sin quemar versiones:** 5.5 es la referencia conocida de este plan, no un ID permanente incrustado en scripts, helpers o lógica del proyecto. La ejecución habitual puede seleccionar `--model sonnet` o `--model opus` para resolver la versión actual de la familia; los aliases no garantizan la misma versión en todos los proveedores. Confirmar el ID canónico realmente usado y registrarlo por sesión. Usar un ID completo solo cuando haga falta reproducibilidad, diagnóstico o mantener estable un bloque ya iniciado. Una nueva versión se incorpora por disponibilidad incluida, compatibilidad y utilidad; no cambiar el modelo a mitad de un bloque sin razón. Mantener las exclusiones Luna/Haiku.

Un mismo nombre de esfuerzo no equivale al mismo consumo/capacidad entre modelos. No heredar `high` global para tareas mecánicas: pasar selección explícita por sesión, comprobar restricciones/env y registrar el nivel solicitado y el efectivo (null si no es verificable). `max` solo para un problema excepcional con hipótesis y límite de alcance; no activar Ultra/Ultracode ni equipos recursivos como default. Si un modelo no está incluido, usar una alternativa permitida incluida; si exige conexión/auth o un cambio de alcance, interrumpir y avisar. No activar API de pago, uso extra ni créditos para desbloquearlo.

Revisión cruzada Codex en T-12, T-13 y reset de T-16: `high`, sobre diff y evidencia concreta; `xhigh` solo cuando el riesgo lo justifique. En bloques no críticos Codex revisa CI y resumen; escalar si aparecen riesgos transversales concretos.

## Clean code como criterio de cierre

- Funciones/componentes con responsabilidad clara, nombres de dominio y dependencias explícitas. Separar UI, HTTP, casos de uso y adapters; handlers delgados y reglas independientes de Vercel para facilitar Lambda.
- Validar entradas en las fronteras del sistema; contratos tipados, dinero/unidades/fechas coherentes y errores explícitos. No ocultar fallos con `any`, casts indiscriminados, silencios o mocks de emergencia.
- Evitar duplicación de reglas y efectos ocultos. Extraer abstracciones cuando exista una necesidad real; no añadir capas, frameworks o generalizaciones por anticipación.
- Cambios pequeños y revisión del diff; retirar código muerto generado por el cambio. Respetar convenciones existentes, conservación de datos y cambios ajenos.
- Pruebas de comportamientos y límites relevantes: permisos, cálculos, errores, reintentos y concurrencia. Typecheck/lint y comprobaciones del bloque deben pasar; ninguna cobertura/longitud arbitraria sustituye evidencia funcional.

Cada encargo exige estas reglas y su revisión antes del cierre. Hallazgos fuera del bloque se registran con prioridad y dependencia; no iniciar una refactorización global incidental.

## Tamaño de bloque y paralelismo

Unidad normal: una capacidad verificable, generalmente uno o dos IDs `T-*` relacionados. Dividir contratos, auth y pedidos complejos en incrementos; no enviar al ejecutor «implementar todo MAUI». Agrupar cambios mecánicos del mismo dominio para amortizar la carga inicial de contexto, manteniendo criterios de cierre claros.

Default: orquestador + **un ejecutor activo**. Permitir un segundo ejecutor solo con dependencias satisfechas y archivos/dominios disjuntos; máximo dos ejecutores además del orquestador. Contratos `shared/`, migraciones y configuración se terminan antes de repartir consumidores. Evitar delegación recursiva salvo justificación concreta. Con backend/contrato estables, T-17/T-18 pueden repartirse por carpetas; cambios de contrato vuelven a un escritor único. El orden y las dependencias de los bloques están en el plan.

Un solo escritor por archivo. Para solapamiento inevitable usar checkout/worktree aislado y revisar/integrar su diff antes de continuar. Antes de ejecutar registrar archivos asignados y cambios preexistentes; ningún asistente revierte trabajo ajeno. Un reviewer recibe solo lectura y evidencia independiente; no modifica en paralelo el código que revisa.

## Administración de sesiones

1. Preparar encargo corto: objetivo, IDs, estado relevante, archivos propios, interfaces, restricciones y comandos de validación. Objetivo orientativo: 300–600 palabras más referencias a archivos; no incluir historial del chat ni todo el plan.
2. Iniciar Claude en modo no interactivo o `codex exec`, con permisos/herramientas adecuados al encargo. Elegir flags del `--help` instalado: documentación reciente puede describir flags inexistentes en estas versiones.
3. Capturar ID explícito de sesión mediante salida estructurada; registrar proveedor, ID, IDs del plan, estado y rama. No usar `--last`/`--continue` sin ID en un repo con sesiones simultáneas.
4. Reanudar ese ID para la corrección del mismo bloque, conservando contexto útil. Sesión nueva al cambiar dominio/objetivo, al cerrar un bloque o cuando el historial aporta ruido; no reiniciar tras cada pequeña corrección ni fragmentar excesivamente trabajo relacionado.
5. Antes de compactar o cambiar proveedor, guardar checkpoint: archivos cambiados, decisiones, pruebas, fallo exacto y próximo paso. Transferir ese resumen y referencias, no transcript completo ni logs de herramientas.
6. Pedir devolución breve: resultado, archivos, validación, limitaciones y próximos pasos. Orquestador inspecciona diff y ejecuta comprobaciones. Cerrar procesos al terminar; no lanzar sesiones completas solo para responder una duda mínima.

Comandos de recuperación: `claude --resume <session_id>` y `codex exec resume <session_id>`. Al reanudar, volver a fijar modelo/esfuerzo y restricciones del encargo. Los IDs de proceso/PTY de las herramientas son temporales y no sustituyen al session ID. La reanudación del chat orquestador desde otro proceso no se presupone: su estado recuperable debe estar en el repo. Modo interactivo para instrucciones sucesivas dentro de un bloque; en ambos modos se aplican checkpoint, cierre de ejecutores y aviso ante conexión/auth necesarias.

**Perfil de implementación:** encargo mínimo suficiente con objetivo, archivos propios, contratos, instrucciones del proyecto/clean code, herramientas necesarias y validación esperada. Cargar configuración y contexto del área de forma deliberada, sin activar todos los conectores por costumbre.

### Cierre, inactividad y consumo de capacidad

Conservar los chats y sesiones guardadas; cerrar los procesos ejecutores cuando su tarea termine o quede bloqueada, sin cerrar y recrear la sesión tras cada interacción del mismo bloque.

| Situación | Acción |
|---|---|
| Ejecutor trabajando en un bloque | Mantenerlo durante el trabajo asignado; controlar alcance y resultado |
| Bloque terminado | Guardar resultado/checkpoint e ID; cerrar el ejecutor y comprobar que sus agentes o tareas en segundo plano terminaron |
| Bloque esperando acceso o respuesta del usuario | Guardar fallo, evidencia y próximo paso; detener el trabajo dependiente y cerrar el ejecutor si no tiene otra tarea |
| Corrección relacionada con el mismo bloque | Reanudar por ID |
| Nuevo dominio o historial con mucho ruido | Sesión nueva con checkpoint y referencias mínimas |

El consumo depende de solicitudes y actividad efectivas además del contexto procesado; Claude Code documenta pequeñas solicitudes en segundo plano incluso inactivo, y una ventana abierta no garantiza consumo cero. [Actividad en segundo plano](https://code.claude.com/docs/en/costs#background-token-usage). Una nueva solicitud en una sesión larga puede reprocesar mucho historial; la caché reduce parte del costo pero expira. Compactar solo cuando la continuidad aporta valor. [Contexto y consumo](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session); [uso eficiente de Codex](https://learn.chatgpt.com/docs/pricing#what-can-i-do-to-make-my-usage-limits-last-longer).

**Cerrar procesos, borrar chats, iniciar sesión nueva o compactar no recupera capacidad consumida ni reinicia cuotas.** El ahorro se busca en ejecuciones acotadas, contexto relevante y cierre de ejecutores sin tarea. Al finalizar un encargo, comprobar y detener únicamente la actividad que le pertenece (incluidas automatizaciones independientes). No borrar historial ni finalizar sesiones ajenas como medida de ahorro. Una estimación monetaria de tokens no es un cobro adicional.

Opus queda reservado a T-10/T-12 y a escalaciones con diagnóstico y alcance registrados; el CRUD habitual vuelve a Sonnet. Antes de T-10 se informa el margen de Claude realmente disponible: porcentaje del usuario con fecha, estado de uso verificable o límite del CLI. Si solo existe un dato anterior, se identifica como tal, sin afirmar una cuota actual.

## Registro de sesiones

[`ejecucion-ia.json`](ejecucion-ia.json) contiene **solo sesiones**, una entrada por ejecutor y bloque: incremento, rama, bloque, proveedor, rol, modelo, esfuerzo solicitado y efectivo, session ID, identificador de ejecución y estado. Un ejecutor que cubre varios bloques tiene una entrada por bloque con el mismo ID, sin contarse como sesión nueva. Datos no expuestos por la herramienta (modelo/ID del chat orquestador, esfuerzo efectivo) se registran `null`; no se inventan. Evidencia técnica, diffs, validaciones, cloud y correcciones viven únicamente en el plan.

Desde T-10 se registra también el modelo y esfuerzo efectivos del orquestador/revisor: usar metadatos `turn_context` de su sesión local cuando estén disponibles. Configuración preferida y flags solicitados no prueban por sí solos el modelo/esfuerzo efectivos. En Claude, registrar el modelo canónico de `system/init`; si solo se expone esfuerzo activado, conservar el nivel efectivo como `null` y registrar el solicitado por separado. No completar retrospectivamente datos no comprobados.

Tokens/duración y cuotas se anotan solo si el CLI o una fuente verificable los expone. No guardar credenciales, transcripts ni errores con secretos. Los checkpoints son comunicación entre agentes, no specs ni aprobaciones SDD.

Encargo reutilizable: «Resuelve [IDs/objetivo]. Tu responsabilidad son [archivos]. No estás solo en el repo: conserva cambios ajenos y coordina cualquier edición fuera de tu alcance. Usa [contratos/referencias]. Cierre: [comportamiento/pruebas]. Devuelve archivos cambiados, pruebas, bloqueantes y siguiente paso; no leas documentación ajena al bloque salvo necesidad».

## Validación y presupuesto

Buscar/leer archivos concretos y limitar logs a fallos accionables. Mantener instrucciones comunes pequeñas; cargar contexto de dominio solo cuando se utiliza. Tests/lint/typecheck son evidencia principal. Aplicar la revisión cruzada de los bloques críticos definida en el reparto; en los demás, Claude verifica diff y comportamiento y Codex revisa CI y resumen. No repetir todas las suites después de un cambio documental ni repetir revisiones aprobadas sin nueva razón. Build y E2E completos al integrar un corte y en la entrega test final.

Un bloque que dependa de API/Postgres solo se cierra con pruebas contra esos servicios reales en test; mocks, memory o demo no lo cierran.

Intentar como máximo dos rondas de corrección sobre el mismo fallo antes de cambiar a diagnóstico explícito: evidencia nueva, hipótesis verificable y corrección acotada. No repetir el mismo intento esperando otro resultado, escalar sin diagnóstico ni trasladar errores entre proveedores sin entenderlos.

**Interrupción por bloqueo:** si hace falta una respuesta que afecte alcance/negocio, conectar una herramienta, autenticar o habilitar acceso externo, detener el trabajo dependiente y avisar de inmediato. Preservar diff y checkpoint; explicar bloqueo, evidencia, intentos, acción mínima del usuario e IDs afectados. Se puede terminar documentación/comprobaciones independientes, pero no presentar el bloque como cerrado ni continuar la acción bloqueada sin respuesta. Resolver primero rutas seguras ya disponibles, como CLI autenticado en lugar de un MCP con scope insuficiente.

Ante 401/403 confirmado de la única vía, login requerido, cuota agotada sin alternativa incluida, credenciales faltantes o servicio no habilitado: no insistir con reautenticaciones ni crear cuentas/planes por cuenta propia. No desactivar seguridad, cambiar proveedor silenciosamente ni sustituir integración real por mock para cerrar la tarea. Una decisión técnica local con requisitos suficientes se resuelve autónomamente; una elección que cambia alcance o requiere al usuario se eleva con alternativas concretas.

Antes de cada lote consultar cuota Codex desde la app; para Claude usar `rate_limit_event.rate_limit_info.unifiedWindows` cuando la salida estructurada del CLI lo exponga (utilization por ventana y resetsAt), o el estado verificable/aviso de límite disponible. Calcular restante como 100 × (1 − utilization); guardar fuente y hora, sin tratar un dato anterior como actual. Conservar margen para integración, revisiones críticas y reporte según la cuota medida, sin umbrales porcentuales fijos. Reducir paralelismo y encargos al acercarse a los límites. Reconsultar antes de ampliar un bloque, tras una tanda de correcciones y antes de asignar el siguiente; aprovechar eventos de la sesión activa sin abrir prompts solo para medir. Comparar ventanas y margen compartido, cargar implementación/gates/preparación de smoke en el proveedor con más margen y reservar Codex para revisión cruzada, integración y reparación. Adaptar contexto y tamaño del encargo con consumo observado; no declarar ahorros sin medición.

Si Claude tiene poco margen, Codex realiza únicamente arreglos pequeños que pueda terminar con su cuota. Si Codex tiene poco margen, reducir su intervención a merge y revisiones críticas y ampliar los encargos autosuficientes de Claude hasta dos bloques relacionados. Si ambos se agotan, guardar estado y reportar la limitación y el reset conocido. No consumir resets de cuenta ni comprar créditos automáticamente.

La contingencia automática desde una terminal se descartó: no completó la orquestación propuesta. No habilitar un modo alternativo que omita la revisión crítica o delegue merges sin verificar sus capacidades. Conservar sesiones/checkpoints y detener el trabajo dependiente cuando falte capacidad o intervención del usuario.

## Fuentes verificadas el 2026-10-01

- [Codex: planes y límites](https://learn.chatgpt.com/docs/pricing): la capacidad depende del modelo/tarea y es compartida entre sesiones.
- [Codex: ejecución no interactiva y resume](https://learn.chatgpt.com/docs/non-interactive-mode).
- [Claude Code: manejo de contexto y costos](https://code.claude.com/docs/en/costs): contexto acotado, sesiones relacionadas y equipos pequeños.
- [Claude Code: CLI y resume](https://code.claude.com/docs/en/cli-reference).
- [Claude Code con Pro/Max](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan): uso compartido y diferencia entre autenticación por suscripción y API.
