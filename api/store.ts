import { withObservability } from './_lib/observability.js'
import { DEFAULT_STORE_ID } from '../maui-back/src/domain/orders/Order.js'
import { toStoreDto } from '../maui-back/src/domain/store/storeMappers.js'
import { getRepositories } from '../maui-back/src/infra/factory.js'
import { systemClock } from '../maui-back/src/shared/clock.js'
import { getStaffStoreSettings, getStoreSettings } from '../maui-back/src/usecases/store/getStore.js'
import { updateStoreSettings } from '../maui-back/src/usecases/store/updateStoreSettings.js'
import { readJsonBody } from './_lib/auth.js'
import { MAX_CATALOG_BODY_BYTES, createOperationHandler } from './_lib/operations.js'
import { ok } from './_lib/response.js'

/**
 * Configuración de tienda y reglas de entrega (T-08), una sola Function:
 *
 * | Ruta              | Método | Acceso                                   |
 * |-------------------|--------|------------------------------------------|
 * | /api/store        | GET    | público (tienda fijada por el servidor)  |
 * | /api/store/staff  | GET    | owner/operator de su tienda              |
 * | /api/store/staff  | PATCH  | owner de su tienda                       |
 *
 * `availability` se calcula con el reloj del servidor en America/Bogota en cada respuesta.
 */
const handler = createOperationHandler(
  {
    store: {
      GET: async ({ res }) => {
        const { store } = await getRepositories()
        ok(res, toStoreDto(await getStoreSettings({ store }, DEFAULT_STORE_ID), systemClock.now()))
      },
    },
    staff: {
      GET: async ({ res, sessionActor }) => {
        const actor = await sessionActor({ mutation: false })
        const { store } = await getRepositories()
        ok(res, toStoreDto(await getStaffStoreSettings({ store }, actor), systemClock.now()))
      },
      PATCH: async ({ req, res, sessionActor }) => {
        const actor = await sessionActor({ mutation: true })
        const body = readJsonBody(req, MAX_CATALOG_BODY_BYTES)
        const { store } = await getRepositories()
        const updated = await updateStoreSettings({ store, clock: systemClock }, actor, body)
        ok(res, toStoreDto(updated, systemClock.now()))
      },
    },
  },
  'store',
)

export default withObservability('/api/store', handler)
