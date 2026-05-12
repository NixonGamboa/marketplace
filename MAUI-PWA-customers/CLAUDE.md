# CLAUDE.md — Reglas del Proyecto MAUI

## Workflow de Features

Al terminar cada feature (después de `/maui.finish`), actualizar `tareas/roadmap.md`:
- Marcar la feature como completada (añadir `✅` al título)
- Anotar la fecha de finalización
- Actualizar el estado de dependencias desbloqueadas si aplica

## Reglas de Implementación de Vistas

Antes de implementar cualquier vista (componente de página, layout o flujo de usuario), el agente **debe leer** `tareas/design/ui-rules.md`.

- Ese archivo es la fuente de verdad para UX, reglas técnicas y decisiones de producto por vista.
- Los sketches en `tareas/design/assets/` son referencia visual de estilos y distribución, no especificación exacta. Los valores reales (colores, textos, lógica) los define el código, siempre alineado con `ui-rules.md`.
- Si una regla de `ui-rules.md` contradice algo en el sketch, prevalece `ui-rules.md`.

## Contexto del Proyecto

Leer `MAUI-CONTEXT.md` para entender el objetivo del producto y el perfil del usuario antes de tomar cualquier decisión de diseño o arquitectura.
