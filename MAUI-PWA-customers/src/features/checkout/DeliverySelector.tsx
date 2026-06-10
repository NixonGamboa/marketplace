/*
DeliverySelector — MAUI Checkout
─────────────────────────────────────────────
Lista única tipo ML/Nequi/WhatsApp:
  - Un solo bloque con borde + 2 filas separadas por divisor sutil
  - Radio relleno cuando está seleccionado, contorno gris cuando no
  - La info dinámica (dirección o ventana de recogida) aparece como
    subtexto dentro de la opción seleccionada — sin tarjetas extra
  - Editor de dirección y picker de franja horaria se expanden debajo
*/

import { useId, useEffect, useRef, useState } from 'react'
import { Package, Truck, MapPin, Loader2, ChevronRight } from 'lucide-react'
import { useCheckoutStore } from './checkoutStore'
import type { DeliveryMode, TimeSlot } from './checkoutStore'

// ─── Sub-types ────────────────────────────────────────────────────────────────

interface TimeSlotOption {
  value: TimeSlot
  label: string
  description: string
}

const TIME_SLOT_OPTIONS: TimeSlotOption[] = [
  { value: 'morning',   label: 'Mañana',          description: '8 am – 12 pm' },
  { value: 'afternoon', label: 'Tarde',            description: '12 pm – 5 pm' },
  { value: 'asap',      label: 'Lo antes posible', description: 'Según disponibilidad' },
]

const PICKUP_SUBTEXT: Record<TimeSlot, string> = {
  morning:   'Recoge tu pedido entre 8 am y 12 pm',
  afternoon: 'Recoge tu pedido entre 12 pm y 5 pm',
  asap:      'Recoge lo antes posible',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DeliverySelector() {
  const baseId = useId()

  const deliveryMode  = useCheckoutStore((s) => s.deliveryMode)
  const timeSlot      = useCheckoutStore((s) => s.timeSlot)
  const address       = useCheckoutStore((s) => s.address)

  const setDeliveryMode = useCheckoutStore((s) => s.setDeliveryMode)
  const setTimeSlot     = useCheckoutStore((s) => s.setTimeSlot)
  const setAddress      = useCheckoutStore((s) => s.setAddress)

  const [geoLoading, setGeoLoading]               = useState(false)
  const [geoError,   setGeoError]                 = useState<string | null>(null)
  const [addressEditorOpen, setAddressEditorOpen] = useState(false)
  const [timeSlotPickerOpen, setTimeSlotPickerOpen] = useState(false)

  const addressInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addressEditorOpen) addressInputRef.current?.focus()
  }, [addressEditorOpen])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleDeliveryClick() {
    if (deliveryMode !== 'delivery') {
      setDeliveryMode('delivery')
      setGeoError(null)
      setAddressEditorOpen(true)
      return
    }
    // Already delivery → toggle editor to allow re-edit
    setAddressEditorOpen((prev) => !prev)
  }

  function handlePickupClick() {
    if (deliveryMode !== 'pickup') {
      setDeliveryMode('pickup' as DeliveryMode)
      setAddressEditorOpen(false)
      setGeoError(null)
      setTimeSlotPickerOpen(true)
      return
    }
    // Already pickup → toggle picker to allow re-edit
    setTimeSlotPickerOpen((prev) => !prev)
  }

  function handleTimeSlotChange(slot: TimeSlot) {
    setTimeSlot(slot)
    setTimeSlotPickerOpen(false)
  }

  function handleAddressInput(e: React.ChangeEvent<HTMLInputElement>) {
    setAddress(e.target.value)
    setGeoError(null)
  }

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no soporta geolocalización. Ingresa la dirección manualmente.')
      return
    }

    setGeoLoading(true)
    setGeoError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setAddress('Mi ubicación actual', latitude, longitude)
        setGeoLoading(false)
        setAddressEditorOpen(false)
      },
      (_err) => {
        setGeoError('No se pudo obtener tu ubicación. Ingresa la dirección manualmente.')
        setGeoLoading(false)
      },
      { timeout: 10000, enableHighAccuracy: false },
    )
  }

  function handleAddressSave() {
    if (address && address.trim().length > 0) {
      setAddressEditorOpen(false)
    }
  }

  const isPickup   = deliveryMode === 'pickup'
  const isDelivery = deliveryMode === 'delivery'
  const hasAddress = Boolean(address && address.trim().length > 0)

  // Split address by first ", " so it can render in two lines like ML
  const addressLines: [string, string | null] = (() => {
    if (!hasAddress) return ['', null]
    const value = address!.trim()
    const idx = value.indexOf(', ')
    if (idx === -1) return [value, null]
    return [value.slice(0, idx), value.slice(idx + 2)]
  })()

  const deliverySubtext = isDelivery
    ? hasAddress
      ? null // multi-line subtext rendered separately
      : 'Toca para agregar tu dirección'
    : 'Te lo llevamos hasta tu casa'

  const pickupSubtext = isPickup
    ? timeSlot
      ? PICKUP_SUBTEXT[timeSlot]
      : 'Elige cuándo quieres recogerlo'
    : 'Pasa por tu pedido cuando quieras'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section aria-labelledby={`${baseId}-heading`} className="space-y-3">
      {/* Section heading */}
      <h2
        id={`${baseId}-heading`}
        className="text-[15px] sm:text-base font-semibold text-brand-dark"
      >
        ¿Cómo quieres recibir tu pedido?
      </h2>

      {/* ── Lista combinada (un solo bloque, divisor entre filas) ─────────── */}
      <div
        role="radiogroup"
        aria-labelledby={`${baseId}-heading`}
        className="overflow-hidden"
      >
        {/* Delivery row */}
        <button
          type="button"
          onClick={handleDeliveryClick}
          role="radio"
          aria-checked={isDelivery}
          className={[
            'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
            'focus-visible:outline-none focus-visible:bg-brand-primary/5',
            'bg-white hover:bg-gray-50',
          ].join(' ')}
        >
          {/* Radio visual */}
          <span
            aria-hidden="true"
            className={[
              'flex-shrink-0 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center transition-colors',
              isDelivery ? 'border-brand-primary' : 'border-gray-300',
            ].join(' ')}
          >
            {isDelivery && <span className="w-2.5 h-2.5 rounded-full bg-brand-primary" />}
          </span>

          {/* Icon */}
          <span
            aria-hidden="true"
            className={[
              'flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl',
              isDelivery ? 'bg-brand-primary/10' : 'bg-gray-100',
            ].join(' ')}
          >
            <Truck
              size={20}
              className={isDelivery ? 'text-brand-primary' : 'text-brand-muted'}
            />
          </span>

          {/* Text */}
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-brand-dark">
                Envío a domicilio
              </span>
              <span
                aria-label="Recomendado"
                className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
              >
                Recomendado
              </span>
            </span>

            {/* Subtext: address (multi-line) or single-line description */}
            {isDelivery && hasAddress ? (
              <span className="mt-0.5 block text-xs leading-snug text-brand-muted">
                <span className="block truncate text-brand-dark">
                  {addressLines[0]}
                </span>
                {addressLines[1] && (
                  <span className="block truncate">{addressLines[1]}</span>
                )}
              </span>
            ) : (
              <span className="mt-0.5 block text-xs text-brand-muted truncate">
                {deliverySubtext}
              </span>
            )}
          </span>

          <ChevronRight
            size={18}
            aria-hidden="true"
            className="flex-shrink-0 text-brand-muted"
          />
        </button>

        {/* Editor de dirección — inline, integrado dentro de la fila delivery */}
        {isDelivery && addressEditorOpen && (
          <div
            id={`${baseId}-address-editor`}
            className="animate-slide-in-top bg-white px-4 pb-4 pt-1 space-y-3"
          >
            <fieldset className="border-0 p-0 m-0">
              <legend className="mb-3 text-sm font-semibold text-brand-dark">
                ¿A dónde te lo llevamos?
              </legend>

              {/* Address text input */}
              <div className="space-y-1">
                <label
                  htmlFor={`${baseId}-address`}
                  className="block text-xs font-medium text-brand-dark/90"
                >
                  Dirección
                </label>
                <input
                  ref={addressInputRef}
                  id={`${baseId}-address`}
                  type="text"
                  name="address"
                  value={address ?? ''}
                  onChange={handleAddressInput}
                  placeholder="Ej. Calle 5 #12-34, Barrio Centro"
                  autoComplete="street-address"
                  className={[
                    'block w-full min-h-12 rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-brand-dark placeholder:text-gray-400 outline-none transition',
                    'focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/40',
                  ].join(' ')}
                />
              </div>

              {/* Geolocation button */}
              <button
                type="button"
                onClick={handleUseLocation}
                disabled={geoLoading}
                aria-busy={geoLoading}
                className={[
                  'mt-3 flex w-full min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-brand-primary bg-white px-4 py-3 text-sm font-medium text-brand-primary transition-colors',
                  'hover:bg-brand-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                ].join(' ')}
              >
                {geoLoading ? (
                  <>
                    <Loader2 size={18} aria-hidden="true" className="animate-spin" />
                    <span>Obteniendo ubicación…</span>
                  </>
                ) : (
                  <>
                    <MapPin size={18} aria-hidden="true" />
                    <span>Usar mi ubicación</span>
                  </>
                )}
              </button>

              {/* Geolocation error */}
              {geoError && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="mt-2 rounded-lg bg-brand-warning-bg px-3 py-2 text-xs font-medium text-brand-warning"
                >
                  {geoError}
                </p>
              )}

              {/* Confirm button */}
              {hasAddress && (
                <button
                  type="button"
                  onClick={handleAddressSave}
                  className={[
                    'mt-3 flex w-full min-h-11 items-center justify-center rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors',
                    'hover:bg-brand-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
                  ].join(' ')}
                >
                  Confirmar dirección
                </button>
              )}
            </fieldset>
          </div>
        )}

        {/* Divisor sutil */}
        <div aria-hidden="true" className="mx-4 h-px bg-brand-border" />

        {/* Pickup row */}
        <button
          type="button"
          onClick={handlePickupClick}
          role="radio"
          aria-checked={isPickup}
          className={[
            'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
            'focus-visible:outline-none focus-visible:bg-brand-primary/5',
            'bg-white hover:bg-gray-50',
          ].join(' ')}
        >
          {/* Radio visual */}
          <span
            aria-hidden="true"
            className={[
              'flex-shrink-0 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center transition-colors',
              isPickup ? 'border-brand-primary' : 'border-gray-300',
            ].join(' ')}
          >
            {isPickup && <span className="w-2.5 h-2.5 rounded-full bg-brand-primary" />}
          </span>

          {/* Icon */}
          <span
            aria-hidden="true"
            className={[
              'flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl',
              isPickup ? 'bg-brand-primary/10' : 'bg-gray-100',
            ].join(' ')}
          >
            <Package
              size={20}
              className={isPickup ? 'text-brand-primary' : 'text-brand-muted'}
            />
          </span>

          {/* Text */}
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-brand-dark">
              Recoger en tienda
            </span>
            <span className="mt-0.5 block text-xs text-brand-muted truncate">
              {pickupSubtext}
            </span>
          </span>

          <ChevronRight
            size={18}
            aria-hidden="true"
            className="flex-shrink-0 text-brand-muted"
          />
        </button>

        {/* Picker de franja horaria — inline, integrado dentro de la fila pickup */}
        {isPickup && timeSlotPickerOpen && (
          <div
            role="radiogroup"
            aria-label="Franja horaria de recogida"
            className="animate-slide-in-top bg-white"
          >
            <p className="px-4 pt-2 pb-2 text-sm font-semibold text-brand-dark">
              ¿A qué hora lo recoges?
            </p>

            {TIME_SLOT_OPTIONS.map((option, idx) => {
              const isChecked = timeSlot === option.value
              const isLast = idx === TIME_SLOT_OPTIONS.length - 1

              return (
                <div key={option.value}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isChecked}
                    onClick={() => handleTimeSlotChange(option.value)}
                    className={[
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:bg-brand-primary/5',
                      'bg-white hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        'flex-shrink-0 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center transition-colors',
                        isChecked ? 'border-brand-primary' : 'border-gray-300',
                      ].join(' ')}
                    >
                      {isChecked && <span className="w-2.5 h-2.5 rounded-full bg-brand-primary" />}
                    </span>

                    <span className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm font-semibold text-brand-dark">
                        {option.label}
                      </span>
                      <span className="text-xs text-brand-muted">
                        {option.description}
                      </span>
                    </span>
                  </button>
                  {!isLast && (
                    <div aria-hidden="true" className="mx-4 h-px bg-brand-border" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
