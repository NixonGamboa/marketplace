/*
SearchBar de MAUI
─────────────────────────────────────────────
- Barra de búsqueda global, integrada en el Header.
- Contiene:
  - Input de texto.
  - Botón con ícono de lupa (usando Icon).
- Estilos:
  - Fondo blanco, borde redondeado.
  - Sombra ligera.
  - Borde morado (#7441d8) en focus.
- Placeholder: "Buscar en Leche y Miel".
- Props:
  - value, onChange (controlado).
  - onSubmit → ejecuta búsqueda.
- Accesibilidad:
  - <label> oculto para screen readers.
  - aria-label="Buscar productos".
- Mobile: ancho completo.
- Desktop: ancho medio (ej: max-w-md), centrado.
*/
import { useState, type FormEvent } from 'react'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import { SEARCH_PLACEHOLDER } from '@/config/app'

interface SearchBarProps {
  value?: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

const SearchBar = ({
  value,
  onChange,
  onSubmit,
  placeholder = SEARCH_PLACEHOLDER,
  autoFocus,
  className = '',
}: SearchBarProps) => {
  const [internal, setInternal] = useState('')
  const val = value !== undefined ? value : internal
  const handleChange = (v: string) => {
    if (onChange) onChange(v)
    else setInternal(v)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit?.(val.trim())
  }
  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label="Buscar productos"
      className={[
        'flex items-stretch w-full max-w-xl rounded-lg md:rounded-xl bg-brand-surface shadow-card border border-brand-border focus-within:border-brand-primary',
        'focus-within:ring-2 focus-within:ring-brand-primary/30 transition',
        className,
      ].join(' ')}
    >
      <label htmlFor="global-search" className="sr-only">
        Buscar productos
      </label>
      <div className="flex-1 min-w-0">
        <Input
          id="global-search"
          type="text"
          value={val}
            onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="border-0 shadow-none focus:ring-0 focus:border-0 bg-transparent px-4 py-2 text-brand-dark placeholder:text-brand-muted"
          autoFocus={autoFocus}
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        size="md"
        aria-label="Buscar"
        className="rounded-l-none rounded-r-xl"
      >
        <Icon name="search" size="md" decorative />
      </Button>
    </form>
  )
}

export type { SearchBarProps }
export default SearchBar
