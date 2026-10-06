# Contratos compartidos de MAUI

Fuente común de DTOs y validación runtime de pedidos, catálogo y tienda. Los frontends importan tipos
desde `@shared/contracts`; los handlers y casos de uso validan datos con Zod.
`orderEnums.ts` y `orderPricing.ts` no dependen de HTTP, BD ni Node.

| Contrato | Uso |
|---|---|
| `createOrderRequestSchema` | POST `/api/orders`, entrada estricta sin campos de resultado ni contexto interno |
| `orderConfirmationSchema` | Respuesta de creación: ID, `received`, estimación y `processingNotice` si se recibió fuera de atención |
| `orderDtoSchema` | Lecturas cliente/admin, salida explícita sin `storeId` ni campos internos |
| `listOrdersQuerySchema` / `orderListResponseSchema` | GET `/api/orders` (T-11): query estricta (`q`, `status`, `from` inclusivo, `to` exclusivo, `limit` 1–100, `cursor` opaco) y `{items: OrderDto[], nextCursor}`; el alcance lo fija la sesión |
| `updateOrderStatusRequestSchema` | PATCH `/api/orders/:id/status` (T-12): `status`, `expectedVersion` y `reason` obligatorio solo al cancelar (5–500) |
| `updateOrderItemsRequestSchema` | PATCH `/api/orders/:id` (T-12): `expectedVersion` y `changes` (`weight`, `remove`, `substitute`) sin ítems ni sustitutos repetidos; `customerContacted: true` (declaración del personal) obligatorio para quitar/sustituir con preferencia `call_me` |
| `apiErrorSchema` | `{error,message,issues?:[{path,message}]}` |
| `contractVersionFrom` / `toV1Order*` | Negociación v1/v2 de las respuestas de pedidos con la cabecera `X-Maui-Contract` (ME-01/03/04) |
| `productDtoSchema` / `categoryDtoSchema` | Catálogo público, mismo shape que `shared/catalog` (`Product`/`Category`) |
| `staffProductDtoSchema` | Vista de personal: añade `active`, `archived` y fechas; nunca `storeId` |
| `create/updateProductRequestSchema`, `create/updateCategoryRequestSchema` | CRUD estricto del owner; `null` borra opcionales en PATCH |
| `storeDtoSchema` | Configuración pública de tienda con `availability` calculada por el servidor |
| `updateStoreSettingsRequestSchema` | PATCH parcial del owner; `timeZone`, tienda y fechas no editables |

Recepción permanente (PM-03): el horario, el día sin atención y el cierre manual no impiden registrar
pedidos; solo un domicilio deshabilitado en la configuración se rechaza. Si el pedido se recibe fuera de
atención (o es un domicilio posterior al corte), el servidor fija `processingNotice` al persistirlo:
`scheduled` con la próxima apertura (`startsAt`, ISO UTC, calculada en `America/Bogota`) o `unscheduled`
sin hora. Indica cuándo se empieza a procesar, no la entrega o recogida. Se guarda en el snapshot de
creación (`order_creations.snapshot`), sin migración, y sale en la confirmación, el detalle y el comprobante.
`availability.timeSlotsDate` (opcional) es la fecha local de `availableTimeSlots`: hoy, la próxima fecha con
atención con una franja compatible (se recorre el ciclo semanal) si hoy no queda ninguna vigente, o ausente si no hay
fecha conocida o no hay franjas. `timeSlotDate` (opcional en la confirmación y en el pedido) es esa fecha fijada por
el servidor para la franja elegida: independiente de `processingNotice`, inmutable y nunca enviada por el cliente.

IDs opacos no autorizan acceso. Estados comunes: `received`, `confirmed`,
`preparing`, `ready`, `in_delivery`, `delivered`, `cancelled`. El paso en camino es
opcional en domicilio; retiro no lo admite. Entregado/cancelado son terminales
(`isTerminalOrderStatus`) e inmutables; los ítems solo cambian en `ITEMS_EDITABLE_STATUS`
(`preparing`).

T-12 añade al `OrderDto`, como campos opcionales para no romper datos demo: `version`
(siempre presente en respuestas del servidor; se reenvía como `expectedVersion`),
`originalItems` (ítems pedidos, desde la primera sustitución o retiro),
`cancellationReason`/`cancelledAt` (juntos y solo en `cancelled`; ausentes en
cancelaciones legacy) y `substitutedFor` por ítem sustituto. El actor del cambio no sale
en el DTO. `finalTotal` refleja los ítems vigentes y existe siempre desde `ready`; ningún pedido
pasa a `in_delivery`/`delivered` sin total final ni pesos reales completos.

Los importes son enteros COP. `priceAtMoment` es un snapshot unitario o precio por
kg. En peso variable se usan gramos enteros, hasta tres decimales de kg, y
redondeo por línea: `floor((precioKg × gramos + 500) / 1000)`. `estimatedTotal`
suma líneas con `kilosRequested` y envío; se preserva. `finalTotal` usa
`kilosReal` y envío y no se admite mientras falte un peso real. La fórmula no
recalcula históricos desde el catálogo actual.

Domicilio acepta dirección/referencia o GPS válido pareado; retiro no lleva
dirección/GPS y envío es cero. Teléfono de salida canónico `57` + móvil colombiano
de diez dígitos; la entrada admite formato legible y normaliza. Las fechas salen
en ISO UTC. Los límites técnicos provisionales evitan entradas desproporcionadas;
las reglas de catálogo/cobertura/precios se completan en T-07/T-08/T-10.

Los mappers backend preservan datos legacy: `productId/quantity/kilos` se adaptan
a `id/qty/kilosRequested`, y `ask/allow/none` a `call_me/similar/remove`. Envío y
total final desconocidos se omiten; no se inventan pesos reales. Filas que no
cumplen el DTO de salida producen un error seguro, no datos malformados.

Los endpoints de pedidos exigen sesión (T-06): el dueño y la tienda los fija el
servidor y `userId` del request solo se admite si coincide con la cuenta autenticada
(si no, 403). Precio y nombre salen del catálogo servidor (T-10), también para los
sustitutos (T-12); los cambios de estado e ítems son atómicos por versión. Este contrato no
acredita que los servicios reales de ambas apps estén conectados: T-17/T-18 y el build real
T-23 siguen pendientes.

## Contrato v2 de pedidos (ME-01, ME-03, ME-04)

Las apps anteriores validan las respuestas con DTO `.strict()`: un campo nuevo, aunque sea opcional, las
rompe. Por eso los campos v2 solo viajan si la petición envía `X-Maui-Contract: 2`; sin la cabecera (o con
otro valor) las cinco respuestas de pedidos (POST/GET listado, GET/PATCH detalle y PATCH estado) salen en la
forma exacta de 1.0.1 (`toV1OrderDto`, `toV1OrderConfirmation`, `toV1OrderList`). Las peticiones v1 siguen
siendo válidas. `Vary` incluye la cabecera. Las apps nuevas deben enviarla en sus lecturas y mutaciones de pedidos.

- `paymentMethod` (`cash`/`qr`/`bre_b`): opcional al crear; sin elegir es `cash`, igual que los pedidos
  anteriores. Solo registra cómo pagará el cliente; no hay pasarela ni estado «pagado».
- `reference`: número comercial por tienda, asignado por la base de datos al guardar e inmutable (también en
  reintentos). `formatOrderReference` produce «Pedido #001248» (6 cifras, sin cortar desde 1 000 000). No
  reemplaza `orderId` en enlaces ni autoriza nada.
- `picked` por ítem y cambio `{ type: 'pick', itemId, picked }`: guardar un peso válido marca la línea,
  `{ type: 'weight', kilosReal: null }` borra peso y marca, desmarcar conserva el peso; una línea de peso
  variable solo se marca con peso real. `pendingPickItems` da las líneas que impiden pasar a `ready`.
- `canReopenPreparation`: `ready` → `preparing` («Reabrir preparación») es la única vuelta atrás; no figura en
  `allowedNextStatuses`. La auditoría (contrato sin cambios) registra el cambio de estado con actor y fecha; las
  marcas quedan como `items_changed` sin detalle de línea para no romper el admin anterior.

## Catálogo y tienda (T-07/T-08)

`catalog.ts`: precio entero COP positivo; en peso variable `price` es precio por kg y
la unidad es siempre `Por Kilogramo`, que un producto de peso fijo no puede usar.
`originalPrice` debe superar al precio; moneda única `COP`; imágenes como ruta del
origen o URL `https`. `active` (publicado), `inStock` (agotado) y `archived`
(retirado sin borrar la fila) son independientes; el público solo ve activos no
archivados. Los pedidos históricos conservan ID y snapshot.

`store.ts`: zona `America/Bogota` explícita, horario semanal `HH:MM` sin nocturnos,
override `auto/open/closed`, franjas `morning/afternoon/asap`, corte de domicilio,
envío y umbral gratis. `contactPhone` es canónico o `null`; el relleno
`573000000000` se rechaza. Cobertura: solo la nota `delivery.coverageNote`; no hay
geocerca ni verificación geográfica automática, el GPS es opcional y una dirección
escrita no se geocodifica.
