# MAUI: mejoras de la prueba manual (2026-10-05)

Este registro es independiente del plan de implementación. Según el usuario, la base es la versión **1.0.1**, que corrige PM-01 a PM-04. Los requisitos marcados como **confirmados** provienen del usuario; lo demás son propuestas para revisión, no implementadas.

## Principio de diseño

Principio expreso del usuario: **«la simplicidad del sistema es la que garantiza el éxito y disminuye la fricción»**. En este documento se aplica así: una acción principal por estado, buen comportamiento por defecto, guardado automático en lugar de botones de guardar y complejidad solo cuando resuelve un problema real del cliente o del operador. Lo que no es indispensable para la primera entrega queda en [Diferido](#diferido).

## Cambios de la revisión UX

Hallazgos en el código actual:

- **Pago:** el pie de página afirma «Pago seguro», pero la app no procesa pagos.
- **Pago:** «QR» y «Bre-B» pueden parecer similares si no se dice qué hace el cliente en cada una.
- **Admin, Listo:** el botón principal dice «Marcar como entregado» también en recogida; «Marcar en camino» queda como secundario.
- **Admin, mensajes:** tras cambiar de estado aparece el valor interno («Estado cambiado a ready»). El motivo del botón deshabilitado solo está en `title`, invisible en pantallas táctiles.
- **Admin, Preparando:** los mismos productos aparecen en tres listas (Items, Cambios de ítems y Picking). Los pesos exigen un botón «Guardar pesos» aparte, y un conflicto (409) descarta los pesos no guardados.
- **Admin, contrato:** desde Listo no se editan productos ni se puede volver a Preparando.
- **Lateral, fuera de ME:** la nota del cliente en Entrega no forma parte del `OrderPayload`; verificar si llega al admin.

Esta revisión simplifica la anterior: el cobro se hace al entregar, sin módulo de pagos; Preparando usa una sola lista con guardado automático; pesar un producto lo marca como alistado; un faltante sin resolver es simplemente una fila sin marcar. Los avances cotidianos no tienen diálogo adicional; pasar a Listo o confirmar entrega/recogida requiere una sola confirmación. Listo puede reabrirse para corregir la preparación antes de salir o entregar. Varias propuestas pasan a [Diferido](#diferido).

## ME-01: Selección del medio de pago en la PWA

**Confirmado:** en el paso Pago, antes de «Resumen de tu pedido», una sección seleccionable con **Efectivo**, **QR** y **Bre-B** (el usuario confirmó Bre-B).

**Propuesta para la primera entrega:** el cliente elige cómo pagará y paga el total final al recibir o recoger. Sin pasarela, sin comprobación automática y sin módulo de pagos. Elegir QR o Bre-B no significa que ya se pagó: ninguna pantalla dice «pagado».

Tarjeta «¿Cómo quieres pagar?» con tres filas tipo radio, tocables en toda su superficie. **Efectivo** viene preseleccionado porque es el flujo actual.

| Opción | Etiqueta | Descripción |
|---|---|---|
| Efectivo | Efectivo | Pagas en efectivo. |
| QR | Código QR | Escaneas el código QR del negocio. |
| Bre-B | Transferencia Bre-B | Usas la llave Bre-B del negocio. |

- **Nota única bajo el grupo:** «Pagas el total final al recibir tu pedido» (o «al recoger tu pedido»). «Si llevas productos por peso, el valor puede ajustarse.»
- **Resumen de tu pedido:** añade «Pago: {método}». Se eliminan el aviso fijo de efectivo y «Pago seguro».
- **Registro:** el método se guarda con el pedido y aparece en el comprobante y en el admin, para que quien entrega llegue preparado.
- **Accesibilidad:** `fieldset` + `legend`, flechas, foco visible, área táctil de al menos 44 px; la selección no depende solo del color. Se conserva al volver a Entrega y al reintentar tras un error.

*Por qué así:* cobrar el total final al entregar evita devoluciones por diferencias de peso y no obliga a mostrar ni mantener datos de cobro en la app.

**Criterios de aceptación**

- El lector de pantalla anuncia el grupo y sus tres opciones; Efectivo aparece seleccionado al entrar.
- La selección se mantiene entre pasos; el pedido real guarda el método, y la PWA, el comprobante y el admin lo muestran.
- La nota cambia con domicilio o recogida. No aparecen «Pago seguro», «pagado» ni datos de cobro de ejemplo.

**Decisiones confirmadas por el usuario — 2026-10-05**

1. Mostrar la etiqueta «Código QR», sin mencionar proveedor ni afirmar que corresponde a una billetera o a Bre-B.
2. Entregar el QR y la llave en persona al cobrar, al recibir o recoger el pedido. No mostrarlos en la app en este incremento.

## ME-02: Mensaje cercano para pedidos fuera de horario

**Confirmado:** se reciben pedidos a cualquier hora; el horario solo rige la atención y la preparación. En vez de «el martes, 6 de octubre a las 8:00 a. m.», usar «mañana a primera hora» o «mañana a las 8 a. m.».

**Propuesta:** un solo texto con una parte variable.

> ¡Recibimos tu pedido! En este momento estamos descansando. Comenzaremos a prepararlo {cuándo}. Puedes ver su estado aquí.

| Próxima atención | {cuándo} |
|---|---|
| Hoy | hoy desde las {hora} |
| Mañana | mañana a primera hora, desde las {hora} |
| Después de mañana o sin hora fiable | en nuestro próximo horario de atención |

- Sin fecha completa ni días de la semana. La hora va en formato es-CO («8 a. m.», «8:30 a. m.») y se calcula en `America/Bogota`. El texto anuncia el inicio de la preparación, no la entrega, y no promete mensajes.
- **Consulta posterior:** «hoy» o «mañana» se calcula al mostrar la pantalla a partir de una fecha y hora absolutas; nunca se guarda la frase ya redactada. Si esa hora pasó y el pedido sigue en Recibido: «Tu pedido está pendiente de preparación. Puedes consultar aquí su estado.» No se afirma que la tienda ya atiende. Desde Confirmado se muestra el mensaje del estado.

*Por qué así:* tres casos cubren todas las situaciones sin parámetros nuevos, y calcular al mostrar evita un «mañana» vencido.

**Criterios de aceptación:** con reloj simulado, probar estos casos:

- pedido a las 9 p. m. con apertura al día siguiente;
- pedido a la 1 a. m. con apertura a las 8 a. m. del mismo día: debe decir «hoy desde las 8 a. m.»;
- pedido a las 11:59 p. m. consultado a las 12:01 a. m.;
- pedido un sábado con apertura el lunes;
- cierre manual sin hora;
- consulta después de la hora con el pedido aún en Recibido.

En ningún caso puede aparecer una fecha completa, un día de la semana ni un «mañana» que ya no sea cierto.

**Decisión confirmada por el usuario — 2026-10-05:** conservar la hora guardada al recibir el pedido, aunque después cambie el horario. Calcular «hoy»/«mañana» al mostrarla; si esa hora ya pasó y el pedido sigue en Recibido, usar «Tu pedido está pendiente de preparación. Puedes consultar aquí su estado.». No recalcular la promesa con el horario vigente ni afirmar que ya comenzó la atención.

## ME-03: Vistas del admin según el estado del pedido

**Confirmado:** una vista enfocada en el estado del pedido; en Preparando, tocar y marcar los productos ya alistados.

**Propuesta.** Los productos solo se editan en Preparando, se puede cancelar hasta Listo, y Entregado y Cancelado son inmutables. No se añaden estados nuevos. **Actualización confirmada por el usuario:** incorporar la transición limitada Listo → Preparando; el contrato actual todavía no la permite y deberá ajustarse junto con la API y el admin.

Reglas comunes:

- Una acción principal al pie. «Contactar» (llamada o wa.me) siempre queda como secundaria. «Cancelar» va en una zona separada, con motivo.
- La vista se abre según el estado; el comprobante y el historial siguen accesibles. La actualización automática no cambia la pestaña ni borra lo que se está escribiendo.
- Los mensajes van en español («Pedido listo», «Salió a domicilio»), y los motivos de bloqueo se ven en pantalla, no en tooltips.

| Estado | Acción principal | Qué mostrar |
|---|---|---|
| Recibido | Confirmar pedido | Antigüedad, «Llegó fuera de horario», modalidad, número de productos, preferencia de sustitución, método de pago. |
| Confirmado | Comenzar preparación | Productos con las cantidades y pesos pedidos. |
| Preparando | Marcar como listo | La lista de alistamiento (ver abajo). |
| Listo, domicilio | Salió a domicilio (secundaria: Entregado) | Total final, método de pago, dirección y mapa. |
| Listo, recogida | Cliente recogió | Total final, método de pago, franja. |
| En camino | Confirmar entrega | Dirección, mapa, contacto, total final, método de pago. No se puede cancelar. |
| Entregado | No tiene | Comprobante en solo lectura. |
| Cancelado | No tiene | Motivo, autor y hora, en solo lectura. |

### Confirmaciones y corrección de estado

- **Confirmar pedido / comenzar preparación:** un toque, sin diálogo adicional.
- **Marcar como listo:** una sola confirmación que muestra el total final y explica que se cierran los ajustes. No encadenar dos confirmaciones.
- **Listo → Preparando:** acción secundaria «Reabrir preparación», disponible para personal autorizado solo mientras el pedido siga en Listo, sin haber salido a domicilio ni sido recogido/entregado. Conservar quién lo reabrió y cuándo; recuperar los datos de preparación existentes y recalcular el total cuando se corrijan productos o pesos. No borrar el historial ni permitir modificar un pedido de una versión anterior.
- **Confirmar entrega o recogida:** una sola confirmación explícita para evitar cerrar por un toque accidental.
- **En camino, Entregado y Cancelado:** sin vuelta atrás desde el flujo habitual. No habilitar retrocesos libres entre todos los estados.

*Por qué así:* corregir la preparación antes de entregar resuelve errores reales sin pedir dos confirmaciones en cada avance. La protección se concentra en los pasos que cierran ajustes o confirman una entrega.

### Preparando: una sola lista

- **Fila por producto:** casilla grande, nombre y cantidad o peso pedido. Tocar la fila marca o desmarca el producto; tocar de nuevo corrige un error. Las filas alistadas se atenúan sin cambiar de lugar, y arriba se ve el avance: «5 de 8 alistados».
- **Peso variable:** el campo está en la propia fila, junto al peso pedido y el subtotal. Un peso válido guardado marca el producto como alistado; borrarlo lo desmarca.
- **Guardado automático** al tocar o al salir del campo, con lo que desaparece el botón «Guardar pesos». Solo si falla, la fila lo indica («No se guardó · Reintentar») y no aparece como alistada. El avance se recupera al recargar o al cambiar de dispositivo.
- **Faltante:** el botón «Falta» de la fila abre el diálogo actual de Sustituir o Quitar. Si el cliente pidió que lo consultaran, el diálogo ofrece contactarlo y solo aplica la decisión del cliente (qué sustituto o si se retira); registrar el contacto no resuelve la fila. Mientras tanto, la fila sigue sin marcar.
- **Sustituido:** el original queda tachado con «Sustituido por {producto}», y el sustituto entra como fila nueva sin marcar. **Retirado:** tachado y fuera del conteo; no se empaca ni se cobra.
- **Concurrencia:** dos operadores pueden marcar productos distintos sin bloquearse. Los cambios sobre el mismo producto o sobre la estructura del pedido se detectan sin perder el peso escrito. El detalle queda para el diseño técnico.
- La pestaña Picking se mantiene para imprimir y copiar.

**Marcar como listo** se habilita cuando todos los productos no retirados están alistados y guardados. Si falta algo, debajo del botón aparece «Faltan 2: Tomate, Arroz», y al tocarlo se va a la fila. Al avanzar, una sola confirmación muestra el total final y avisa que los productos y pesos quedarán cerrados; pueden corregirse mediante «Reabrir preparación» antes de salir o entregar.

*Por qué así:* el guardado automático elimina un paso; pesar y alistar se hacen con una sola acción; tratar un faltante pendiente como una fila sin marcar evita un estado nuevo. La lista completa controla los pendientes, y una sola confirmación protege el cierre del total sin duplicar diálogos.

**Criterios de aceptación**

- Al marcar o desmarcar un producto, otro dispositivo o una recarga muestran el mismo avance.
- Guardar un peso válido marca el producto; borrarlo lo desmarca.
- Si falla el guardado, la fila queda sin marcar y ofrece Reintentar.
- Si el cliente pidió consulta, «Hablé con el cliente» sin una decisión registrada no resuelve la fila.
- El sustituto entra sin marcar; el retirado queda fuera del conteo.
- Listo está deshabilitado mientras haya pendientes, que se ven en pantalla, y se habilita con todo alistado.
- Confirmar pedido y comenzar preparación no abren un diálogo adicional; pasar a Listo y confirmar entrega/recogida abren exactamente una confirmación.
- Reabrir preparación devuelve Listo a Preparando con autorización, control de versión y registro de actor/fecha. No funciona desde En camino, Entregado o Cancelado; el historial y los datos previos se conservan.
- Domicilio muestra «Salió a domicilio»; recogida no ofrece En camino; En camino no ofrece Cancelar; Entregado y Cancelado no tienen controles de edición.

**Decisión confirmada por el usuario — 2026-10-05:** exigir que todos los productos no retirados estén alistados y guardados antes de pasar a Listo, con pesos válidos cuando corresponda. No ofrecer «Marcar listo igual» con pendientes.

**Fuera de este incremento:** definir qué hacer con una entrega fallida. En camino solo puede pasar a Entregado; se conserva el flujo actual sin añadir estados.

## ME-04: Referencia legible del pedido

**Confirmado:** no mostrar identificadores técnicos como referencia del pedido, sino una referencia comercial corta y consecutiva, por ejemplo «Pedido #001248». Debe ser la misma en la PWA, el admin, el comprobante y WhatsApp. Se asigna al guardar el pedido, nunca cambia, es única por tienda y no se reinicia cada día. Un reintento idempotente conserva el número del pedido original. El identificador interno sigue en la BD y la API para relaciones, enlaces y permisos, y la referencia legible no reemplaza la autorización. Tampoco se muestran identificadores técnicos de productos, usuarios o categorías cuando basta su nombre. Los identificadores internos no se eliminan y los enlaces existentes no se rompen.

**Propuesta para la primera entrega:**

- **Formato:** «Pedido #» seguido del número con ceros hasta 6 cifras. A partir de 1 000 000 se muestra completo, sin truncar.
- **Asignación:** la hace el servidor de forma atómica al crear el pedido, con unicidad por tienda garantizada en la base de datos. Se aceptan saltos (por ejemplo, tras una creación fallida); no se promete una numeración sin huecos.
- **Pedidos anteriores:** reciben una sola vez una referencia estable, por orden de creación, y ninguno queda sin número.
- **Textos:** el listado, el detalle, el comprobante y los mensajes de WhatsApp usan la referencia. Productos, usuarios y categorías se nombran por su nombre.

*Por qué así:* un número corto se dicta y se reconoce fácilmente por teléfono. Asignarlo en el servidor evita duplicados, y aceptar saltos evita contadores frágiles y bloqueos.

**Criterios de aceptación**

- La PWA, el admin, el comprobante y WhatsApp muestran el mismo «Pedido #…», sin ningún identificador técnico visible.
- Dos pedidos creados a la vez en la misma tienda reciben números distintos, y un reintento idempotente devuelve el mismo número.
- Los pedidos anteriores muestran una referencia estable, que no cambia al recargar ni al llegar pedidos nuevos.
- Los enlaces existentes siguen funcionando, y conocer un número no da acceso a un pedido ajeno.

## Diferido

Queda fuera de la primera entrega, salvo que la operación demuestre que hace falta:

- Registro de «pago verificado» (autor, hora, método recibido), filtro «Por cobrar» y gestión de devoluciones.
- Datos de cobro en la app, botón Copiar y envío de comprobantes por wa.me.
- Pregunta «¿Necesitas cambio?» para efectivo.
- Aviso de peso anómalo, interruptor «Ocultar alistados», orden de atención en el listado y conteo de bultos.
- Prefijo de tienda en la referencia (por ejemplo, LM-001248) cuando haya varias tiendas, y códigos comerciales para otras entidades.

## Prioridad y orden sugerido

1. **ME-02:** cambio de texto acotado, con pruebas de reloj.
2. **ME-03:** primero Preparando y Listo (lista única, guardado automático, regla de Listo y etiquetas por modalidad); después las demás vistas.
3. **ME-01:** el selector y su reflejo en el comprobante y el admin, con «Código QR» y datos de cobro entregados en persona, según las decisiones confirmadas.
4. **ME-04:** referencia legible asignada en el servidor y mostrada en todos los canales.

Es una propuesta de orden; no hay ninguna ejecución iniciada.

## Referencias

- Captura de Pago aportada en el chat: `codex-clipboard-c3fa4040-9c3e-4aa6-866c-bb2b43159f94.png`. El celular del cliente no se copia aquí.
- Código revisado: `MAUI-PWA-customers/src/features/checkout/CheckoutPage.tsx`, `maui-admin-front/src/features/orders/OrderDetailPage.tsx`, `PickingListView.tsx`, `ItemChangesPanel.tsx` y `shared/contracts/orderEnums.ts`.
- Las implementaciones futuras siguen [la política de entregas](orquestacion-ia.md#gitflow-y-separación-de-entregas). Este registro no modifica `estado-plan.md` ni la certificación de 1.0.1.
- Revisión UX: Claude Opus 5.5 (`claude-opus-5-5`), esfuerzo solicitado alto; revisado por Codex para respetar los requisitos del usuario. Sesión: `f49098a7-25bd-4e00-8eda-94e8d32cae49`. ME-04 se añadió por decisión del usuario, en la sesión Opus 5.5 que escribió el [plan](plan-mejoras-ux-20261005.md).
