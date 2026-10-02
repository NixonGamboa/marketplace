# Evidencia de validación en artefactos

Se aplica a ejecuciones nuevas desde este cambio. No publicar reportes históricos ni actualizar PR anteriores.

**Un reporte final por PR, máximo 200 líneas físicas de Markdown**, incluidos títulos, tablas y líneas vacías. El artefacto contiene únicamente `report.md`; no adjuntar volcados JSON ni logs completos. El generador comprueba el límite antes de escribir/publicar.

Contenido: versión/entorno, resumen y tipo de pruebas, gates, casos funcionales relevantes con preparación/request, resultado esperado y observado, fallos, limpieza y limitaciones. Seleccionar los campos de respuesta que demuestran el comportamiento, no cuerpos enormes. El reporte no sustituye una prueba por una afirmación ni atribuye mutación/E2E/cloud no ejecutados.

## CI

`ci.yml` publica `evidencia-ci-<run>-<intento>` incluso si falla un gate. Genera `report.md` con versión comprobada, resultado de instalación/checks/build, gates y totales por aplicación, cobertura por suites y fallos. Los JSON de Vitest son insumos temporales del runner y no se suben al artefacto. Los gates posteriores a un fallo figuran como no ejecutados. Si la instalación falla, no se inventan resultados de pruebas. Este CI usa memory/PostgreSQL embebido y no demuestra comportamiento en cloud.

Si los detalles de fallos/suites exceden el espacio, conserva sus totales, prioriza fallos y declara cuántos muestra, con enlace al log de Actions para el resto. No ocultar ni convertir fallos en resultados aprobados. Para una PR sin smoke, este es su reporte final.

## Preview

Después de un smoke nuevo, el orquestador prepara un JSON **sin credenciales ni datos personales** e invoca `ci.yml` con el input `report` sobre develop o una feature. Ese modo ejecuta únicamente el job publicador: no sustituye ni omite los gates de un PR, y exige la referencia a un CI previamente aprobado. Sin input se ejecuta el CI completo. El publicador entrega un único reporte final **CI + Preview**; no hace requests, modifica cloud ni ejecuta el smoke. Exige resumen de CI, sus SHA/enlace/resultado, SHA del deployment Preview, fecha, limitaciones y preparación/resultado esperado/observado por caso. No asumir que el SHA de CI y el deployment son iguales: identificarlos por separado.

Incluir status HTTP y campos relevantes del cuerpo observado en `actual`; añadir comprobaciones SQL y limpieza como casos adicionales. Cada caso ocupa una fila. Una prueba fallida o CI no aprobado deja el workflow rojo pero conserva su evidencia. Un reporte inválido o mayor de 200 líneas no se publica: resumir casos de la misma regla con cantidades y evidencia representativa, conservando todos los fallos y declarando la agrupación.

Formato (valores ilustrativos; reemplazar por evidencia realmente obtenida):

```json
{
  "block": "T-XX",
  "testedCommit": "<SHA completo de 40 caracteres>",
  "executedAt": "<fecha ISO de la prueba nueva>",
  "deployment": {
    "id": "<ID real del deployment>",
    "url": "https://<deployment>.vercel.app",
    "environment": "preview"
  },
  "ci": {
    "run": "https://github.com/<owner>/<repo>/actions/runs/<id>",
    "testedCommit": "<SHA completo comprobado por CI>",
    "result": "passed",
    "summary": "<totales reales por app, tipos comprobados y gates>"
  },
  "limitations": "<pruebas no ejecutadas o límites; ninguna si no existen>",
  "checks": [{
    "name": "Cliente B consulta un pedido de A",
    "setup": "Pedido de A creado en este smoke; GET /api/orders/<id> con sesión de B",
    "expected": { "status": 404 },
    "actual": { "status": 404, "body": { "<campo real>": "<valor observado>" } },
    "status": "passed"
  }]
}
```

Enviar el archivo revisado mediante GitHub CLI, sin poner su contenido en comandos o logs:

```sh
gh workflow run ci.yml --ref develop -F report=@/ruta/al/reporte-nuevo.json
```

El input admite hasta el límite de GitHub para `workflow_dispatch`; mantener el reporte compacto (máximo 65.535 caracteres para los inputs). No adjuntar `.env`, cookies, headers de autenticación, URLs de BD, transcripts o carpetas de trabajo completas. La redacción automática es una defensa adicional, no reemplaza la revisión del productor.

## Enlace en la PR

Cada PR enlaza **un solo reporte final de máximo 200 líneas**. Copiar su enlace del resumen de Actions a la descripción, junto con el resultado y el SHA probado. Si aplica smoke, usar el reporte combinado CI + Preview; el artefacto CI previo queda como respaldo de esa ejecución, sin añadir otro reporte al apartado de evidencia de la PR. Para smoke posterior al merge, enlazar el combinado en la siguiente PR de cierre sin atribuirlo a un commit diferente.

Retención explícita: **90 días**, sujeta a la política del repositorio. Los artefactos requieren acceso al repositorio y dejan de estar disponibles al caducar o al borrar el run. No se incorporan al código ni sustituyen el estado/evidencia de cierre en el plan.
