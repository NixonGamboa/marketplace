import { useState, type FormEvent } from 'react'
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
      className={['relative w-full', className].join(' ')}
    >
      <label htmlFor="global-search" className="sr-only">
        Buscar productos
      </label>

      {/* Ícono lupa (izquierda) */}
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-brand-muted">
        <Icon name="search" size="sm" decorative />
      </span>

      <input
        id="global-search"
        type="text"
        value={val}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={[
          'w-full rounded-xl border border-brand-border bg-white pl-10 pr-4 py-2.5 text-sm text-brand-dark',
          'placeholder:text-brand-muted/70 outline-none transition-all',
          'hover:border-brand-primary/40',
          'focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 focus:shadow-brand-sm',
        ].join(' ')}
      />

      {/* Botón enviar accesible */}
      <button type="submit" className="sr-only" aria-label="Buscar">
        Buscar
      </button>
    </form>
  )
}

export type { SearchBarProps }
export default SearchBar
