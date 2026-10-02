import { issuesFromZodError, updateOrderItemsRequestSchema } from '../../../../shared/contracts/index.js'
import type { CatalogRepository } from '../../domain/catalog/CatalogRepository.js'
import type { Order } from '../../domain/orders/Order.js'
import { assertCanManageOrder, type OrderActor } from '../../domain/orders/orderAccess.js'
import { applyItemChanges } from '../../domain/orders/orderLifecycle.js'
import { ValidationError } from '../../shared/errors.js'
import { commitOrderChange, readOrderForChange, type OrderChangeDeps } from './orderChanges.js'

export interface UpdateOrderItemsDeps extends OrderChangeDeps {
  catalog: Pick<CatalogRepository, 'findProduct'>
}

/**
 * Pesos reales, sustituciones y retiro de ítems durante la preparación (`orderLifecycle`). Precio y
 * nombre de los sustitutos salen del catálogo de la tienda del pedido, nunca del request; la
 * escritura exige que ese producto siga igual (versión) y que el pedido no haya cambiado.
 */
export const updateOrderItems = async (
  deps: UpdateOrderItemsDeps,
  actor: OrderActor,
  id: string,
  input: unknown,
): Promise<Order> => {
  assertCanManageOrder(actor)
  const parsed = updateOrderItemsRequestSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Invalid body', issuesFromZodError(parsed.error))
  const { expectedVersion, changes } = parsed.data

  const { current, context } = await readOrderForChange(deps, actor, id, expectedVersion)
  const productIds = changes.flatMap((change) => (change.type === 'substitute' ? [change.productId] : []))
  const products = await Promise.all(productIds.map((productId) => deps.catalog.findProduct(current.storeId, productId)))
  const catalog = new Map(productIds.map((productId, index) => [productId, products[index] ?? null]))

  const next = applyItemChanges(current, changes, catalog, context)
  const used = products.flatMap((product) => (product ? [{ id: product.id, version: product.version }] : []))
  return commitOrderChange(deps, current, next, used)
}
