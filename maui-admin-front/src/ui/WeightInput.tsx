/**
 * @spec §8, §12 — Input de peso en kg para items de peso variable.
 * Muestra un hint con el peso sugerido (kilosRequested del cliente) cuando esté disponible.
 * Valida que el valor sea >= 0; rechaza valores negativos sin lanzar excepción.
 */
import { useState, useEffect } from 'react'

interface WeightInputProps {
  value: number | null
  suggested?: number
  onChange(value: number): void
  id?: string
  label?: string
  disabled?: boolean
}

export function WeightInput({
  value,
  suggested,
  onChange,
  id = 'weight-input',
  label,
  disabled = false,
}: WeightInputProps) {
  const [display, setDisplay] = useState(() => (value != null && value > 0 ? String(value) : ''))

  // Sync external value changes (e.g. reset)
  useEffect(() => {
    setDisplay(value != null && value > 0 ? String(value) : '')
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setDisplay(raw)
    const parsed = parseFloat(raw)
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(parsed)
    }
  }

  function handleBlur() {
    const parsed = parseFloat(display)
    if (isNaN(parsed) || parsed < 0) {
      // Revert to last valid value on invalid input
      setDisplay(value != null && value > 0 ? String(value) : '')
    } else {
      setDisplay(String(parsed))
      onChange(parsed)
    }
  }

  const showSuggested = suggested != null && suggested > 0

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="kg"
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          aria-label={label ?? 'Peso en kg'}
          aria-describedby={showSuggested ? `${id}-hint` : undefined}
          className="w-full pr-10 pl-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 disabled:bg-gray-50 disabled:text-gray-400 transition"
        />
        <span className="absolute right-3 text-xs text-gray-400 select-none">kg</span>
      </div>
      {showSuggested && (
        <p id={`${id}-hint`} className="text-xs text-gray-500">
          Pedido: {suggested} kg
        </p>
      )}
    </div>
  )
}
