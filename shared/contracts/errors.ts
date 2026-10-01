import { z } from 'zod'

/** Detalle de validación serializable: ruta con puntos (`items.0.qty`) y mensaje. */
export const contractIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
})

export type ContractIssue = z.infer<typeof contractIssueSchema>

/** Envelope único de error de la API: `{ error, message, issues? }`. */
export const apiErrorSchema = z
  .object({
    error: z.string().min(1),
    message: z.string().min(1),
    issues: z.array(contractIssueSchema).optional(),
  })
  .strict()

export type ApiError = z.infer<typeof apiErrorSchema>

export const buildApiError = (
  error: string,
  message: string,
  issues?: readonly ContractIssue[],
): ApiError => (issues ? { error, message, issues: [...issues] } : { error, message })

export const issuesFromZodError = (err: z.ZodError): ContractIssue[] =>
  err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
