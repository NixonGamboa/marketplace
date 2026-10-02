# Contratos compartidos de MAUI

Fuente común de DTOs y validación runtime de pedidos. Los frontends importan tipos
desde `@shared/contracts`; los handlers y casos de uso validan datos con Zod.
`orderEnums.ts` y `orderPricing.ts` no dependen de HTTP, BD ni Node.

| Contrato | Uso |
|---|---|
| `createOrderRequestSchema` | POST `/api/orders`, entrada estricta sin campos de resultado ni contexto interno |
| `orderConfirmationSchema` | Respuesta de creación: ID, `received` y estimación |
| `orderDtoSchema` | Lecturas cliente/admin, salida explícita sin `storeId` ni campos internos |
| `updateOrderStatusRequestSchema` | PATCH de estado, vocabulario común |
| `apiErrorSchema` | `{error,message,issues?:[{path,message}]}` |

IDs opacos no autorizan acceso. Estados comunes: `received`, `confirmed`,
`preparing`, `ready`, `in_delivery`, `delivered`, `cancelled`. El paso en camino es
opcional en domicilio; retiro no lo admite. Entregado/cancelado son terminales;
las transiciones atómicas y trazabilidad completa quedan en T-12.

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
(si no, 403). Faltan catálogo servidor e idempotencia (T-10) y actualizaciones
atómicas de estados/pesos (T-12): precio y nombre del request siguen siendo datos
del cliente que esos bloques reemplazarán por autoridad del servidor. Este contrato no acredita que los servicios reales de ambas apps estén
conectados: T-17/T-18 y el build real T-23 siguen pendientes.
