import { z } from 'zod'
import { entityIdSchema } from './common.js'
import { listCursorSchema, listLimitSchema, listTimestampSchema } from './orderList.js'
import { ORDER_STATUS_VALUES } from './orderEnums.js'

export const AUDIT_ENTITY_VALUES = ['order', 'product', 'category', 'store'] as const
export const AUDIT_ACTION_VALUES = ['created', 'updated', 'deleted', 'status_changed', 'items_changed'] as const
/** Nombres de campos, nunca sus valores libres ni snapshots personales. */
export const AUDIT_FIELD_VALUES = ['name', 'icon', 'slug', 'illustrationUrl', 'order', 'categoryId', 'name_display', 'name_legal', 'price', 'originalPrice', 'unit', 'imageUrl', 'inStock', 'is_variable_weight', 'badge', 'description', 'nutritionalInfo', 'availability', 'active', 'archived', 'contactPhone', 'address', 'weeklySchedule', 'scheduleOverride', 'delivery', 'timeSlots', 'status', 'items', 'finalTotal'] as const
export const auditMetadataSchema = z.object({
  fields: z.array(z.enum(AUDIT_FIELD_VALUES)).max(40).optional(),
  previousVersion: z.number().int().positive().optional(),
  version: z.number().int().positive().optional(),
  previousStatus: z.enum(ORDER_STATUS_VALUES).optional(),
  status: z.enum(ORDER_STATUS_VALUES).optional(),
  estimatedTotal: z.number().int().nonnegative().optional(),
  finalTotal: z.number().int().nonnegative().optional(),
  changes: z.array(z.object({
    type: z.enum(['weight', 'remove', 'substitute']),
    itemId: entityIdSchema,
    productId: entityIdSchema.optional(),
    qty: z.number().int().positive().max(100).optional(),
    kilosRequested: z.number().positive().max(100).optional(),
    kilosReal: z.number().positive().max(100).optional(),
    customerContacted: z.boolean().optional(),
  }).strict()).max(50).optional(),
}).strict()
export const auditEventSchema = z.object({
  id: entityIdSchema,
  storeId: entityIdSchema,
  entity: z.enum(AUDIT_ENTITY_VALUES),
  entityId: entityIdSchema,
  action: z.enum(AUDIT_ACTION_VALUES),
  actorKind: z.enum(['account', 'system']),
  actorId: entityIdSchema.nullable(),
  createdAt: z.string().datetime(),
  metadata: auditMetadataSchema,
}).strict().refine(event => event.actorKind === 'account' ? event.actorId !== null : event.actorId === null)
export const listAuditQuerySchema = z.object({
  entity: z.enum(AUDIT_ENTITY_VALUES).optional(),
  entityId: entityIdSchema.optional(),
  action: z.enum(AUDIT_ACTION_VALUES).optional(),
  from: listTimestampSchema.optional(),
  to: listTimestampSchema.optional(),
  limit: listLimitSchema.optional(),
  cursor: listCursorSchema.optional(),
}).strict().superRefine((query, ctx) => {
  if (query.from !== undefined && query.to !== undefined && query.from >= query.to) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: '`from` debe ser anterior a `to`' })
}).transform(({ limit, ...query }) => ({ ...query, limit: limit ?? 20 }))
export const auditListResponseSchema = z.object({ items: z.array(auditEventSchema).max(100), nextCursor: z.string().max(512).nullable() }).strict()
export type AuditEvent = z.infer<typeof auditEventSchema>
export type AuditMetadata = z.infer<typeof auditMetadataSchema>
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>
export type AuditListResponse = z.infer<typeof auditListResponseSchema>
