# MAUI: plan de mejoras UX ME-01 a ME-04 (2026-10-05)

**Estado: planificado. No hay nada ejecutado, desplegado ni certificado.** Los requisitos, textos y criterios están en [mejoras de la prueba manual](mejoras-prueba-manual-20261005.md), que separa lo confirmado por el usuario de las propuestas. Las cuatro decisiones operativas de QR, entrega de datos de cobro, horario guardado y alistamiento completo fueron confirmadas explícitamente por el usuario el 2026-10-05; las demás propuestas conservan su carácter de opciones de implementación. Principio: «la simplicidad del sistema es la que garantiza el éxito y disminuye la fricción».

## Alcance

- **ME-01:** selector Efectivo/QR/Bre-B antes del resumen, con Efectivo preseleccionado. El método se guarda y se ve en el comprobante y en el admin; los pedidos anteriores aparecen como Efectivo. No se procesan ni se verifican pagos.
- **ME-02:** texto relativo (hoy, mañana o próximo horario) en `America/Bogota`, calculado al mostrar la pantalla a partir de la hora ya guardada. Sin fecha completa ni día de la semana.
- **ME-03:** admin según el estado del pedido. En Preparando hay una lista táctil con avance que se conserva, y pesos, faltantes y sustituciones en la misma fila. Guardado automático y errores visibles. Confirmar pedido y Comenzar preparación con un toque; Listo y entrega/recogida con una sola confirmación. «Reabrir preparación» solo de Listo a Preparando.
- **ME-04:** referencia «Pedido #001248», consecutiva y única por tienda, que se asigna al guardar y nunca cambia. Es la misma en la PWA, el admin, el comprobante y WhatsApp. No se muestran identificadores técnicos; los internos y los enlaces se conservan.

**Fuera de alcance:** estados nuevos; cobros o pasarela de pago; datos de cobro en la app; retrocesos desde En camino, Entregado o Cancelado; numeración sin saltos; prefijo de tienda o códigos para otras entidades; y lo marcado como [Diferido](mejoras-prueba-manual-20261005.md#diferido).

## Ejecución

- Una feature creada desde `develop` actualizado, en un checkout o worktree aislado si hay trabajo ajeno. **Un solo PR a develop** con implementación, correcciones, evidencia y estado.
- **Codex** orquesta: asigna archivos, registra la sesión y hace una **revisión crítica** del diff y de la evidencia antes del merge, porque el bloque toca permisos, estados, importes, concurrencia y numeración.
- **Un ejecutor Claude** trabaja en secuencia. Propuesta: Opus `high`, con el modelo efectivo registrado. Sin Luna ni Haiku, sin API de pago ni uso extra.

## Pasos secuenciales

| # | Dueño | Cambio | Verificable |
|---|---|---|---|
| 1 | `shared/contracts` | Método de pago opcional al crear (por defecto Efectivo), marca de alistado por ítem, transición Listo → Preparando y referencia del pedido en las respuestas. | Tests de contrato. Los pedidos anteriores siguen validando y una PWA anterior en caché sigue funcionando pese a los DTO estrictos. |
| 2 | `maui-back` + `api/` | Migración nueva y aditiva; las aplicadas no se editan, y si cambia la función de creación, se redefine en la nueva. Listo exige que cada ítem no retirado esté marcado y, si es de peso variable, que tenga un peso válido. Borrar el peso desmarca el ítem; desmarcarlo conserva el peso. Reabrir conserva datos e historial y registra actor y fecha en la auditoría existente. La referencia se asigna de forma atómica dentro de la creación, con unicidad por tienda en la BD; no se usa MAX+1 sin protección ni se genera en el frontend. Se aceptan saltos, y los pedidos anteriores reciben una referencia estable en la misma migración. | Integración contra Postgres: permisos, aislamiento por tienda, 409 por versión, idempotencia, total recalculado, creación concurrente sin duplicados, reintento con el mismo número y pedidos anteriores numerados. |
| 3 | PWA | Selector accesible que se conserva entre pasos y al reintentar; método en el resumen y el comprobante. ME-02 como función pura. Referencia en la confirmación, los pedidos, el comprobante y WhatsApp. | Los 6 casos con reloj simulado, tests del selector y ningún identificador técnico visible. |
| 4 | Admin | Vista por estado sobre la lista existente, con guardado automático. Ante un 409, vuelve a leer el pedido sin perder el peso escrito. Mensajes en español y acción Reabrir. Referencia en el listado, el detalle, el picking y WhatsApp; los enlaces siguen usando el identificador interno. | Tests de componentes con los criterios de ME-03 y ME-04. |
| 5 | Ejecutor | Gates, E2E, PR y evidencia. | Ver [Verificación de cierre](#verificación-de-cierre). |

Los pasos 3 y 4 empiezan con 1 y 2 en verde. Se reutilizan los contratos, la versión optimista, la auditoría, el diálogo de sustitución y el cálculo del total, sin capas nuevas.

## Gates y entrega

- Tipos, lint, tests, drift de migraciones y build en los paquetes tocados. CI en verde, sin bypass.
- **E2E completo en test** contra la API y Postgres reales, con SHA y entorno identificados. La excepción sin E2E de 1.0.1 no se extiende a esta entrega. Los mocks o el modo demo no cierran el bloque.
- Sin reset ni seed, salvo que se coordine con la prueba humana. Nada en Production.
- Merge y despliegue según las autorizaciones vigentes al ejecutar. Mientras siga la congelación de prueba, se respeta, y el merge espera la aprobación final que exige. El tag es el siguiente de parche según la convención y los tags existentes; no se mueven tags publicados.

## Decisiones operativas confirmadas por el usuario — 2026-10-05

- Mostrar «Código QR», sin mencionar proveedor.
- Entregar el QR y la llave en persona al cobrar; no mostrarlos en la app en este incremento.
- ME-02 conserva la hora guardada al recibir el pedido, sin recalcularla si cambia el horario. Si ya pasó y el pedido sigue en Recibido, mostrar «Tu pedido está pendiente de preparación».
- Listo queda bloqueado mientras haya productos no retirados sin alistar/guardar o pesos obligatorios inválidos. No hay opción de avanzar con pendientes.

## Otras opciones de implementación

- Reabrir lo pueden hacer los mismos roles que cambian estados.
- Un desmarcado accidental se corrige volviendo a marcar, sin perder datos.
- La referencia tiene 6 cifras rellenadas con ceros, sin truncar al superarlas.
- La entrega fallida queda fuera.

## Verificación de cierre

1. Un pedido real guarda Efectivo, QR o Bre-B, y el comprobante y el admin lo muestran. Los pedidos anteriores aparecen como Efectivo. No aparecen «Pago seguro» ni «pagado».
2. Los 6 casos de ME-02 pasan, sin fecha completa, día de la semana ni un «mañana» vencido.
3. El avance se ve igual tras recargar o en otro dispositivo. Un fallo o un 409 no marca la fila ni pierde el peso, y desmarcar conserva el peso.
4. Listo solo se habilita con todo marcado y pesado. Confirmar y Comenzar no abren diálogos; Listo y entrega/recogida abren exactamente uno.
5. Reabrir solo funciona desde Listo, con permiso, versión, actor y fecha, y conserva datos e historial.
6. El mismo «Pedido #…» aparece en la PWA, el admin, el comprobante y WhatsApp. Es único por tienda incluso con creación concurrente, se mantiene en los reintentos y los pedidos anteriores también lo tienen. Los enlaces internos siguen funcionando y conocer un número no da acceso a un pedido ajeno.
7. Precios, idempotencia y aislamiento siguen en verde, y el E2E completo en test pasa. Hay un solo PR, con CI en verde y revisión crítica de Codex. Mientras se prepara el PR puede figurar evidencia pendiente, pero eso no cierra la entrega.
