# MAUI — Implementación directa con Codex y Claude Code

## Forma de trabajo

- El proyecto se desarrolla mediante implementaciones directas con Codex y Claude Code. No se utiliza Tech SDD Kit ni se requieren comandos `/tech.*`, specs por fases o aprobaciones SDD.
- Plan y fuente única del estado global: `docs/tecnicos/estado-plan.md`. Ejecutar los bloques respetando sus dependencias; actualizar estado, evidencia y limitaciones al cerrar cada bloque.
- Codex orquesta las sesiones según `docs/tecnicos/orquestacion-ia.md`. Los ejecutores reciben el bloque y contexto mínimo; usar suscripciones, sin activar cobro API ni créditos adicionales.
- Gitflow y separación de entregas: política única en `docs/tecnicos/orquestacion-ia.md`, sección «Gitflow y separación de entregas», conciliada con el commit `5c9855c`. Revisar base y autorizaciones antes de crear ramas, ordenar commits o incorporar una feature pendiente.
- Antes de editar, revisar el código y las instrucciones del área. Mantener cambios concretos y comprobarlos con typecheck, lint y pruebas apropiadas.
- Aplicar clean code en todos los bloques: responsabilidades claras, nombres de dominio, contratos tipados, validación de entradas, errores explícitos y abstracciones proporcionales. Mantener lógica de negocio independiente del runtime; revisar diff y comportamiento antes de cerrar.
- Seleccionar modelo/esfuerzo explícitos por complejidad según la estrategia de orquestación. No usar ninguna variante Luna de Codex ni Haiku de Claude, incluidos fallbacks y subagentes. Registrar modelo efectivo; usar únicamente capacidad incluida en las suscripciones.
- Si hace falta aclaración del usuario, conectar una herramienta o autenticar/habilitar acceso, interrumpir el trabajo dependiente y avisar con evidencia y acción mínima requerida. Primero resolver vías seguras ya disponibles. Máximo dos intentos sobre el mismo fallo antes de diagnosticar; no repetir ciclos, desactivar seguridad ni cerrar con mocks por bloqueo.
- Si ambos asistentes trabajan sobre el repositorio, asignar archivos/responsabilidades, revisar cambios existentes y evitar escrituras concurrentes sobre los mismos archivos. No revertir trabajo del otro asistente.
- Documentación nueva en español; términos técnicos como API, REST, CRUD, mock y store pueden conservarse en English.

## Entrega actual

- Ambiente de test con seed reproducible; puede reutilizar datos de `shared/catalog/` y de los mocks actuales.
- PWA y admin consumen API real y Postgres persistente. El flujo de negocio, autenticación, permisos y cálculos es equivalente al que se usará en producción.
- Diferencias por entorno: datos, credenciales, URLs, almacenamiento y destinos/sandbox de integraciones externas. No sustituir pedidos, catálogo o auth por mocks para declarar terminada la entrega.
- El plan cubre implementación y validación técnica automatizada. No incluye acuerdos, reuniones, pruebas humanas, surtido comercial, entrenamiento ni lanzamiento comercial.
- Alcance sencillo de contacto: comprobante/seguimiento dentro de PWA/admin y enlaces `wa.me` con texto preparado. Evolution API, VPS y mensajería automática quedan fuera de la entrega actual; solo evolución E-07 si se solicita.

## Arquitectura y referencias

- Stack inicial: Vercel Functions + Neon Postgres + Drizzle, según `docs/tecnicos/adr-001-stack-backend.md`. Mantener handlers delgados, lógica de negocio independiente e interfaces de persistencia/storage. Añadir interfaces de otras integraciones cuando se implementen, sin scaffolds vacíos.
- Destino de escala: AWS Lambda; migrar el runtime no obliga a cambiar Postgres ni a adoptar DynamoDB/Cognito/S3 ahora.
- PWA: `MAUI-PWA-customers/`; admin: `maui-admin-front/`; lógica backend: `maui-back/`; handlers: `api/`; contratos y seed base: `shared/`.
- `tech/features/` y `tech/backlog.md` conservan antecedentes. No se actualizan como requisito de ejecución ni son la fuente del nuevo plan.
- Contexto: `MAUI-PWA-customers/MAUI-CONTEXT.md`; backend: `maui-back/README.md`. Los RFC/roadmaps y reglas históricas SDD se interpretan con el alcance vigente de este documento y del plan.
