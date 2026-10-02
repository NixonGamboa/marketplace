import { issuesFromZodError, updateOrderStatusRequestSchema } from '../../../../shared/contracts/index.js'
import type { Order } from '../../domain/orders/Order.js'
import { assertCanManageOrder, type OrderActor } from '../../domain/orders/orderAccess.js'
import { applyStatusChange } from '../../domain/orders/orderLifecycle.js'
import { ValidationError } from '../../shared/errors.js'
import { commitOrderChange, readOrderForChange, type OrderChangeDeps } from './orderChanges.js'

export type UpdateOrderStatusDeps = OrderChangeDeps

/**
 * Transición de estado de la máquina común según la modalidad (`orderLifecycle`). Solo personal de
 * la tienda del pedido; el rol se exige antes de validar o leer. Atómica por versión y estado: dos
 * transiciones concurrentes sobre la misma versión no se aplican ambas (la segunda recibe 409).
 */
export const updateOrderStatus = async (
  deps: UpdateOrderStatusDeps,
  actor: OrderActor,
  id: string,
  input: unknown,
): Promise<Order> => {
  assertCanManageOrder(actor)
  const parsed = updateOrderStatusRequestSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError('Invalid body', issuesFromZodError(parsed.error))
  const { status, expectedVersion, reason } = parsed.data

  const { current, context } = await readOrderForChange(deps, actor, id, expectedVersion)
  return commitOrderChange(deps, current, applyStatusChange(current, { status, reason }, context))
}
