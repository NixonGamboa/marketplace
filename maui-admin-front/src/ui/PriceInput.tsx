/**
 * @spec §8 — Input de precio en COP con separador de miles.
 * Formato de display: '12.345' (punto como separador de miles, estilo colombiano).
 * El prop onChange devuelve el valor como number (no formateado).
 * Parseo robusto: acepta '12.345', '12,345', '12345' → 12345.
 */
import { useState, useEffect } from 'react'

interface PriceInputProps {
  value: number
  onChange(value: number): void
  label?: string
  id?: string
  disabled?: boolean
  min?: number
}

function formatCOP(n: number): string {
  if (!isFinite(n) || isNaN(n)) return ''
  // Separador de miles con punto (convenio COP)
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n)
}

function parseRaw(raw: string): number {
  // Eliminar separadores de miles (punto o coma) y convertir a número
  const clean = raw.replace(/[.,\s]/g, '').trim()
  const n = parseInt(clean, 10)
  return isNaN(n) ? 0 : n
}

export function PriceInput({
  value,
  onChange,
  label,
  id = 'price-input',
  disabled = false,
  min = 0,
}: PriceInputProps) {
  const [display, setDisplay] = useState(() => formatCOP(value))
  const [focused, setFocused] = useState(false)

  // Sync external value when not focused
  useEffect(() => {
    if (!focused) {
      setDisplay(formatCOP(value))
    }
  }, [value, focused])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow typing freely; only digits and separators
    const raw = e.target.value
    setDisplay(raw)
    const parsed = parseRaw(raw)
    if (parsed !== value) onChange(parsed)
  }

  function handleBlur() {
    setFocused(false)
    // Re-format on blur to normalise display
    const parsed = parseRaw(display)
    setDisplay(formatCOP(parsed))
    if (parsed !== value) onChange(parsed)
  }

  function handleFocus() {
    setFocused(true)
    // Show raw digits while editing for clarity
    setDisplay(value > 0 ? String(value) : '')
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <span className="absolute left-3 text-sm text-gray-500 select-none">$</span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          min={min}
          aria-label={label ?? 'Precio en COP'}
          className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 disabled:bg-gray-50 disabled:text-gray-400 transition"
        />
        <span className="absolute right-3 text-xs text-gray-400 select-none">COP</span>
      </div>
    </div>
  )
}
