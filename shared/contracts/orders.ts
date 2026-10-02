import { z } from 'zod'
import {
  canonicalMobileSchema,
  copAmountSchema,
  entityIdSchema,
  isoUtcSchema,
  mobileInputSchema,
} from './common.js'
import {
  DELIVERY_TYPE_VALUES,
  ORDER_STATUS_VALUES,
  SUBSTITUTION_PREF_VALUES,
  TIME_SLOT_VALUES,
} from './orderEnums.js'
import { isGramPrecision } from './orderPricing.js'

/**
 * Contrato único de pedidos. DTO de cliente/público, NO el modelo interno.
 *
 * Request de creación (`createOrderRequestSchema`): `.strict()`, así que rechaza campos de
 * resultado o de contexto (`status`, `orderId`, `storeId`, `customerId`, `estimatedTotal`,
 * `finalTotal`, `kilosReal`, fechas). El servidor los asigna; el cliente no los decide.
 *
 * Dueño y tienda salen de la sesión (T-06). `userId` no aporta identidad: debe coincidir con
 * la cuenta autenticada o el servidor deniega (403). El teléfono es contacto no verificado y
 * tampoco otorga acceso.
 *
 * Autoridad (T-10): nombre, precio, unidad y peso variable salen del catálogo de la tienda;
 * subtotal, redondeo, envío y gratuidad, de las reglas de tienda con el reloj del servidor.
 * `name`, `priceAtMoment` e `is_variable_weight` de los ítems y `shippingCost` se admiten como
 * campos LEGACY opcionales y se IGNORAN: nunca fijan importes ni el snapshot persistido y no
 * forman parte de la huella de idempotencia. Stock: solo flags del catálogo, sin descontar.
 *
 * Idempotencia: `POST /api/orders` exige la cabecera `Idempotency-Key`. Alcance cuenta + tienda
 * + clave: repetir la misma petición devuelve el pedido original (aunque el catálogo o la
 * tienda hayan cambiado) y otra petición con la misma clave responde 409 `IDEMPOTENCY_KEY_REUSED`.
 */

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'

/** Clave opaca generada por el cliente (p. ej. UUID v4), estable entre reintentos del mismo pedido. */
export const idempotencyKeySchema = z
  .string()
  .min(16, 'Idempotency-Key requiere entre 16 y 128 caracteres')
  .max(128, 'Idempotency-Key requiere entre 16 y 128 caracteres')
  .regex(/^[A-Za-z0-9._:-]+$/, 'Idempotency-Key solo admite letras, dígitos y . _ : -')

export const ORDER_LIMITS = {
  maxItems: 50,
  maxQtyPerItem: 99,
  minKilos: 0.001,
  maxKilos: 100,
  maxNameLength: 120,
  maxAddressLength: 300,
} as const

const kilosSchema = z
  .number()
  .finite()
  .min(ORDER_LIMITS.minKilos)
  .max(ORDER_LIMITS.maxKilos)
  .refine(isGramPrecision, 'Los kilos admiten hasta 3 decimales (gramos)')

const itemShape = {
  id: entityIdSchema,
  /** Snapshot del nombre al ordenar. Opcional en pedidos legacy. */
  name: z.string().trim().min(1).max(200).optional(),
  /** Unidades. En peso variable es siempre 1 (la cantidad real son los kilos). */
  qty: z.number().int().min(1).max(ORDER_LIMITS.maxQtyPerItem),
  /** Precio unitario, o precio por kg en peso variable (ADR-006). */
  priceAtMoment: copAmountSchema,
  is_variable_weight: z.boolean().optional(),
  /** Peso solicitado por el cliente; se preserva como estimación original. */
  kilosRequested: kilosSchema.optional(),
}

/** Snapshot de la unidad del catálogo (T-10); ausente en pedidos legacy. */
const unitSnapshotSchema = z.string().trim().min(1).max(60)

interface WeightRuleItem {
  qty: number
  is_variable_weight?: boolean | undefined
  kilosRequested?: number | undefined
  kilosReal?: number | undefined
}

const refineWeightRules = (item: WeightRuleItem, ctx: z.RefinementCtx): void => {
  const issue = (path: string, message: string): void =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })

  if (item.is_variable_weight) {
    if (item.kilosRequested === undefined) {
      issue('kilosRequested', 'Requerido en productos de peso variable')
    }
    if (item.qty !== 1) issue('qty', 'En peso variable qty debe ser 1')
    return
  }
  if (item.kilosRequested !== undefined) {
    issue('kilosRequested', 'Solo aplica a productos de peso variable')
  }
  if (item.kilosReal !== undefined) {
    issue('kilosReal', 'Solo aplica a productos de peso variable')
  }
}

/**
 * Ítem tal como lo envía el cliente: producto, cantidad y kilos pedidos. `name`,
 * `priceAtMoment` e `is_variable_weight` son legacy e ignorados (ver cabecera); el servidor
 * contrasta qty/kilos con el producto del catálogo.
 */
export const orderItemInputSchema = z
  .object({ ...itemShape, priceAtMoment: copAmountSchema.optional() })
  .strict()
  // La forma de peso se contrasta con el catálogo, nunca con el flag legacy del cliente.

/** Ítem persistido/expuesto: snapshot + peso real pesado por el aliado (`kilosReal`). */
export const orderItemSchema = z
  .object({ ...itemShape, unit: unitSnapshotSchema.optional(), kilosReal: kilosSchema.optional() })
  .strict()
  .superRefine(refineWeightRules)

export const deliveryDataSchema = z
  .object({
    address: z.string().trim().min(1).max(ORDER_LIMITS.maxAddressLength).optional(),
    lat: z.number().finite().min(-90).max(90).optional(),
    lng: z.number().finite().min(-180).max(180).optional(),
    timeSlot: z.enum(TIME_SLOT_VALUES).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if ((data.lat === undefined) !== (data.lng === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [data.lat === undefined ? 'lat' : 'lng'],
        message: 'lat y lng deben enviarse juntos',
      })
    }
  })

interface DeliveryRuleOrder {
  deliveryType: (typeof DELIVERY_TYPE_VALUES)[number]
  deliveryData: z.infer<typeof deliveryDataSchema>
  shippingCost?: number | undefined
}

/**
 * Delivery exige dirección/referencia O coordenadas (lat y lng pareados, ya garantizado por
 * `deliveryDataSchema`); pickup no lleva dirección/GPS ni costo de envío.
 */
const refineDeliveryRules = (order: DeliveryRuleOrder, ctx: z.RefinementCtx): void => {
  const issue = (path: string[], message: string): void =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })

  if (order.deliveryType === 'delivery') {
    const { address, lat } = order.deliveryData
    if (address === undefined && lat === undefined) {
      issue(['deliveryData'], 'El domicilio requiere dirección/referencia o coordenadas GPS')
    }
    return
  }
  const { address, lat, lng } = order.deliveryData
  if (address !== undefined || lat !== undefined || lng !== undefined) {
    issue(['deliveryData'], 'El retiro en tienda no lleva dirección ni GPS')
  }
  if ((order.shippingCost ?? 0) !== 0) {
    issue(['shippingCost'], 'El retiro en tienda no tiene costo de envío')
  }
}

const customerNameSchema = z.string().trim().min(1).max(ORDER_LIMITS.maxNameLength)

/** POST /api/orders — lo único que el cliente puede decidir. */
export const createOrderRequestSchema = z
  .object({
    /** Debe ser la cuenta de la sesión; el servidor lo comprueba y nunca lo usa como identidad. */
    userId: entityIdSchema,
    items: z
      .array(orderItemInputSchema)
      .min(1)
      .max(ORDER_LIMITS.maxItems)
      .superRefine((items, ctx) => {
        const seen = new Set<string>()
        items.forEach((item, index) => {
          if (seen.has(item.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, 'id'],
              message: 'Producto repetido en el pedido',
            })
          }
          seen.add(item.id)
        })
      }),
    substitutionPreference: z.enum(SUBSTITUTION_PREF_VALUES),
    deliveryType: z.enum(DELIVERY_TYPE_VALUES),
    deliveryData: deliveryDataSchema,
    customerName: customerNameSchema,
    customerPhone: mobileInputSchema,
    /** LEGACY ignorado: el envío lo cotiza el servidor con las reglas de la tienda. */
    shippingCost: copAmountSchema.optional(),
  })
  .strict()
  .superRefine((order, ctx) => refineDeliveryRules({ ...order, shippingCost: 0 }, ctx))

/** PATCH /api/orders/:id/status */
export const updateOrderStatusRequestSchema = z
  .object({ status: z.enum(ORDER_STATUS_VALUES) })
  .strict()

/** Respuesta de POST /api/orders. */
export const orderConfirmationSchema = z
  .object({
    orderId: entityIdSchema,
    status: z.literal('received'),
    estimatedTotal: copAmountSchema,
  })
  .strict()

/**
 * Pedido expuesto a clientes (PWA/admin). Excluye `storeId` y cualquier dato interno;
 * `customerPhone`, `shippingCost`, `finalTotal` y `updatedAt` son opcionales para pedidos legacy.
 */
export const orderDtoSchema = z
  .object({
    orderId: entityIdSchema,
    userId: entityIdSchema,
    status: z.enum(ORDER_STATUS_VALUES),
    items: z.array(orderItemSchema).min(1).max(ORDER_LIMITS.maxItems),
    deliveryType: z.enum(DELIVERY_TYPE_VALUES),
    deliveryData: deliveryDataSchema,
    substitutionPreference: z.enum(SUBSTITUTION_PREF_VALUES),
    customerName: customerNameSchema,
    /** Celular canónico `57` + 10 dígitos (apto para `wa.me`/`tel:`). */
    customerPhone: canonicalMobileSchema.optional(),
    /** Snapshot del envío cotizado al pedir. */
    shippingCost: copAmountSchema.optional(),
    /** Estimación original (ítems con peso solicitado + envío). Nunca se sobrescribe. */
    estimatedTotal: copAmountSchema,
    /** Total cobrado con pesos reales; ausente mientras falten pesos. */
    finalTotal: copAmountSchema.optional(),
    createdAt: isoUtcSchema,
    updatedAt: isoUtcSchema.optional(),
  })
  .strict()
  .superRefine(refineDeliveryRules)
  .superRefine((order, ctx) => {
    const missingRealWeight = order.items.some(
      (item) => item.is_variable_weight && item.kilosReal === undefined,
    )
    if (order.finalTotal !== undefined && missingRealWeight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finalTotal'],
        message: 'finalTotal requiere el peso real de todos los ítems de peso variable',
      })
    }
  })

export type OrderItemInput = z.infer<typeof orderItemInputSchema>
export type OrderItemDto = z.infer<typeof orderItemSchema>
export type DeliveryDataDto = z.infer<typeof deliveryDataSchema>
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>
export type UpdateOrderStatusRequest = z.infer<typeof updateOrderStatusRequestSchema>
export type OrderConfirmationDto = z.infer<typeof orderConfirmationSchema>
export type OrderDto = z.infer<typeof orderDtoSchema>
