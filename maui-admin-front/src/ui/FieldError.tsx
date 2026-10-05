/**
 * Mensaje de error junto a un campo. El campo lo referencia con `aria-describedby={fieldErrorId(id)}`
 * y `aria-invalid`; `invalidInputClass` (fieldStyles) da el borde rojo visible.
 */
import { fieldErrorId } from './fieldStyles'

export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null
  return (
    <p id={fieldErrorId(id)} role="alert" className="mt-1 text-xs font-medium text-red-600">
      {message}
    </p>
  )
}
