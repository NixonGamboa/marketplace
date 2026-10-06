import { sharedCategories, sharedProducts } from '../../../../shared/catalog/index.js'
import type { DeliveryType, OrderItemChange, OrderStatus, SubstitutionPref } from '../../../../shared/contracts/index.js'
import { STORE_SEED_ID, STORE_SEED_SETTINGS } from '../store/storeSeed.js'

/**
 * Dataset de test versionado (T-16). Son DATOS: catálogo y tienda salen de `shared/catalog` y
 * `storeSeed`; las cuentas y los pedidos se declaran aquí y se siembran siempre por los casos de
 * uso reales (auth, creación y ciclo de vida de pedidos). Sin contraseñas ni secretos: esas
 * credenciales llegan por entorno al ejecutar el seed. Cambiar cualquier fixture exige subir
 * `SEED_DATASET_VERSION`; el manifiesto (`buildSeedManifest`) cambia de hash con cualquier edición.
 */
export const SEED_DATASET_VERSION = 'test-seed-v1'
export const SEED_STORE = STORE_SEED_ID

/** Instante de creación de tienda, catálogo y cuentas: fijo, para que el resultado sea reproducible. */
export const SEED_EPOCH = '2026-09-01T12:00:00.000Z'

export type SeedStaffKey = 'owner' | 'operator'
export type SeedCustomerKey = 'ana' | 'luis'

export interface SeedStaffSpec {
  key: SeedStaffKey
  id: string
  role: 'owner' | 'operator'
  name: string
  email: string
  storeId: string
}

export interface SeedCustomerSpec {
  key: SeedCustomerKey
  id: string
  name: string
  /** Celular de fixture (rango 300 000 00xx): no es el contacto de ninguna persona ni del negocio. */
  phone: string
}

export const SEED_STAFF: readonly SeedStaffSpec[] = [
  { key: 'owner', id: 'acc_seed_owner', role: 'owner', name: 'Propietario de prueba', email: 'propietario@seed.maui.invalid', storeId: SEED_STORE },
  { key: 'operator', id: 'acc_seed_operator', role: 'operator', name: 'Operario de prueba', email: 'operario@seed.maui.invalid', storeId: SEED_STORE },
]

export const SEED_CUSTOMERS: readonly SeedCustomerSpec[] = [
  { key: 'ana', id: 'acc_seed_customer_ana', name: 'Ana Prueba', phone: '3000000001' },
  { key: 'luis', id: 'acc_seed_customer_luis', name: 'Luis Prueba', phone: '3000000002' },
]

export type SeedOrderAction =
  | { kind: 'status'; status: OrderStatus; reason?: string }
  | { kind: 'items'; changes: OrderItemChange[] }

export interface SeedOrderStep {
  actor: SeedStaffKey
  action: SeedOrderAction
}

export interface SeedOrderSpec {
  /** ID persistido del pedido: determinista, nunca aleatorio. */
  id: string
  customer: SeedCustomerKey
  /** Instante de creación, dentro del horario y antes del corte de la tienda de test (T-08). */
  createdAt: string
  request: {
    items: { id: string; qty: number; kilosRequested?: number }[]
    substitutionPreference: SubstitutionPref
    deliveryType: DeliveryType
    deliveryData: { address?: string; timeSlot?: 'morning' | 'afternoon' | 'asap' }
  }
  /** Cambios posteriores, en orden; cada uno sube la versión del pedido en 1. */
  steps: readonly SeedOrderStep[]
}

/** Pasos de estado consecutivos del mismo actor. */
const advance = (actor: SeedStaffKey, ...statuses: OrderStatus[]): SeedOrderStep[] =>
  statuses.map(status => ({ actor, action: { kind: 'status', status } }))

/**
 * Pedidos representativos. Fechas: lunes 14 a jueves 17 de septiembre de 2026, 09:30–11:00 hora
 * de Bogotá (UTC-5), dentro del horario 08:00–20:00, antes del corte de domicilio (17:00) y en
 * franjas vigentes. Cobertura: los siete estados, recogida y domicilio, peso fijo y variable,
 * envío gratis, estimado y final, sustitución con `call_me`, retiro de pesos y cancelaciones.
 * El producto agotado del catálogo (`jabon-bano-3pack`) no es pedible, por lo que no aparece en
 * ningún pedido (lo comprueban las pruebas).
 */
export const SEED_ORDERS: readonly SeedOrderSpec[] = [
  {
    id: 'ord-seed-recibido-recogida', customer: 'ana', createdAt: '2026-09-14T15:00:00.000Z',
    request: {
      items: [{ id: 'leche-entera-1l', qty: 2 }, { id: 'arroz-1kg', qty: 1 }],
      substitutionPreference: 'similar', deliveryType: 'pickup', deliveryData: {},
    },
    steps: [],
  },
  {
    id: 'ord-seed-confirmado-domicilio', customer: 'luis', createdAt: '2026-09-15T16:00:00.000Z',
    request: {
      items: [{ id: 'frijol-bola-roja-500g', qty: 2 }, { id: 'aceite-girasol-1l', qty: 1 }],
      substitutionPreference: 'similar', deliveryType: 'delivery',
      deliveryData: { address: 'Carrera 3 # 5-20, Dolores', timeSlot: 'afternoon' },
    },
    steps: advance('owner', 'confirmed'),
  },
  {
    id: 'ord-seed-preparando-peso-variable', customer: 'ana', createdAt: '2026-09-16T14:30:00.000Z',
    request: {
      items: [{ id: 'queso-campesino-250g', qty: 1, kilosRequested: 1.5 }, { id: 'yogurt-natural-1l', qty: 1 }],
      substitutionPreference: 'similar', deliveryType: 'delivery',
      deliveryData: { address: 'Calle 7 # 2-15, Dolores', timeSlot: 'morning' },
    },
    steps: advance('operator', 'confirmed', 'preparing'),
  },
  {
    id: 'ord-seed-listo-recogida-sustitucion', customer: 'luis', createdAt: '2026-09-16T15:00:00.000Z',
    request: {
      items: [
        { id: 'queso-campesino-250g', qty: 1, kilosRequested: 0.5 },
        { id: 'gaseosa-cola-2l', qty: 1 },
        { id: 'azucar-1kg', qty: 2 },
      ],
      substitutionPreference: 'call_me', deliveryType: 'pickup', deliveryData: {},
    },
    steps: [
      ...advance('operator', 'confirmed', 'preparing'),
      {
        actor: 'operator',
        action: {
          kind: 'items',
          changes: [
            { type: 'weight', itemId: 'queso-campesino-250g', kilosReal: 0.52 },
            { type: 'substitute', itemId: 'gaseosa-cola-2l', productId: 'agua-botella-600ml', qty: 2, customerContacted: true },
            { type: 'pick', itemId: 'azucar-1kg', picked: true },
          ],
        },
      },
      // El sustituto entra sin alistar (ME-03): se marca antes de pasar a listo.
      { actor: 'operator', action: { kind: 'items', changes: [{ type: 'pick', itemId: 'agua-botella-600ml', picked: true }] } },
      ...advance('owner', 'ready'),
    ],
  },
  {
    id: 'ord-seed-en-camino-domicilio', customer: 'ana', createdAt: '2026-09-17T15:00:00.000Z',
    request: {
      items: [
        { id: 'queso-campesino-250g', qty: 1, kilosRequested: 1 },
        { id: 'lenteja-500g', qty: 2 },
        { id: 'atun-lata-170g', qty: 1 },
      ],
      substitutionPreference: 'similar', deliveryType: 'delivery',
      deliveryData: { address: 'Carrera 4 # 6-31, Dolores', timeSlot: 'morning' },
    },
    steps: [
      ...advance('operator', 'confirmed', 'preparing'),
      { actor: 'operator', action: { kind: 'items', changes: [
        { type: 'weight', itemId: 'queso-campesino-250g', kilosReal: 1.05 },
        { type: 'pick', itemId: 'lenteja-500g', picked: true },
        { type: 'pick', itemId: 'atun-lata-170g', picked: true },
      ] } },
      ...advance('operator', 'ready', 'in_delivery'),
    ],
  },
  {
    id: 'ord-seed-entregado-domicilio-gratis', customer: 'luis', createdAt: '2026-09-14T16:00:00.000Z',
    request: {
      items: [{ id: 'detergente-1kg', qty: 2 }, { id: 'aceite-girasol-1l', qty: 1 }],
      substitutionPreference: 'remove', deliveryType: 'delivery',
      deliveryData: { address: 'Calle 5 # 4-12, Dolores', timeSlot: 'afternoon' },
    },
    steps: [
      ...advance('owner', 'confirmed', 'preparing'),
      { actor: 'owner', action: { kind: 'items', changes: [
        { type: 'pick', itemId: 'detergente-1kg', picked: true },
        { type: 'pick', itemId: 'aceite-girasol-1l', picked: true },
      ] } },
      ...advance('owner', 'ready', 'in_delivery', 'delivered'),
    ],
  },
  {
    id: 'ord-seed-entregado-recogida-peso', customer: 'ana', createdAt: '2026-09-15T15:00:00.000Z',
    request: {
      items: [{ id: 'queso-campesino-250g', qty: 1, kilosRequested: 2 }, { id: 'chorizo-250g', qty: 1 }],
      substitutionPreference: 'similar', deliveryType: 'pickup', deliveryData: {},
    },
    steps: [
      ...advance('operator', 'confirmed', 'preparing'),
      { actor: 'operator', action: { kind: 'items', changes: [
        { type: 'weight', itemId: 'queso-campesino-250g', kilosReal: 1.98 },
        { type: 'pick', itemId: 'chorizo-250g', picked: true },
      ] } },
      ...advance('operator', 'ready', 'delivered'),
    ],
  },
  {
    id: 'ord-seed-cancelado-recibido', customer: 'luis', createdAt: '2026-09-17T16:30:00.000Z',
    request: {
      items: [{ id: 'salchichas-viena-250g', qty: 2 }],
      substitutionPreference: 'similar', deliveryType: 'delivery',
      deliveryData: { address: 'Carrera 2 # 3-08, Dolores', timeSlot: 'afternoon' },
    },
    steps: [{ actor: 'owner', action: { kind: 'status', status: 'cancelled', reason: 'El cliente pidió cancelar antes de la confirmación' } }],
  },
  {
    id: 'ord-seed-cancelado-confirmado', customer: 'ana', createdAt: '2026-09-17T14:45:00.000Z',
    request: {
      items: [{ id: 'nevera-haceb-250l', qty: 1 }],
      substitutionPreference: 'similar', deliveryType: 'pickup', deliveryData: {},
    },
    steps: [
      ...advance('operator', 'confirmed'),
      { actor: 'owner', action: { kind: 'status', status: 'cancelled', reason: 'Sin existencias para el pedido completo' } },
    ],
  },
]

/** Estado esperado del pedido tras aplicar `applied` pasos (0 = recién creado). */
export const expectedStatusAfter = (spec: SeedOrderSpec, applied: number): OrderStatus => {
  let status: OrderStatus = 'received'
  for (const step of spec.steps.slice(0, applied)) {
    if (step.action.kind === 'status') status = step.action.status
  }
  return status
}

export const finalStatusOf = (spec: SeedOrderSpec): OrderStatus => expectedStatusAfter(spec, spec.steps.length)

/** Clave de idempotencia estable de cada pedido; con el cliente y la tienda identifica su claim. */
export const seedOrderKey = (spec: SeedOrderSpec): string => `maui-seed:${spec.id}`

/** Instante del paso `index` (0-based): 10 minutos después del anterior. */
export const stepInstant = (spec: SeedOrderSpec, index: number): string =>
  new Date(Date.parse(spec.createdAt) + (index + 1) * 10 * 60_000).toISOString()

/** Cuerpo `POST /api/orders` del pedido para su cliente: el mismo contrato que usa la PWA. */
export const orderRequestFor = (spec: SeedOrderSpec, customerId: string): Record<string, unknown> => ({
  userId: customerId,
  items: spec.request.items,
  substitutionPreference: spec.request.substitutionPreference,
  deliveryType: spec.request.deliveryType,
  deliveryData: spec.request.deliveryData,
  customerName: seedCustomerOf(spec.customer).name,
  customerPhone: seedCustomerOf(spec.customer).phone,
})

export const seedCustomerOf = (key: SeedCustomerKey): SeedCustomerSpec => {
  const customer = SEED_CUSTOMERS.find(candidate => candidate.key === key)
  if (!customer) throw new Error(`Cliente de seed desconocido: ${key}`)
  return customer
}

export const SEED_CATEGORY_IDS: readonly string[] = sharedCategories.map(category => category.id)
export const SEED_PRODUCT_IDS: readonly string[] = sharedProducts.map(product => product.id)
export const SEED_ORDER_IDS: readonly string[] = SEED_ORDERS.map(order => order.id)
export const SEED_STORE_SETTINGS = STORE_SEED_SETTINGS
