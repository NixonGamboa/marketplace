/*
DeliverySelector — MAUI Checkout
─────────────────────────────────────────────
Toggle pickup / delivery + submodos:
  - Pickup:   3 radio buttons de franja horaria
  - Delivery: input de dirección + Geolocation API

Reglas de diseño (ui-rules.md §4 — Cierre):
  - Botones grandes touch-friendly (min-h-12)
  - Estado seleccionado: borde 2 brand-primary, fondo brand-primary/10
  - Zona del pulgar: CTAs en la mitad inferior de pantalla
  - Contraste 7:1 exigido por el proyecto
*/

import { useId, useRef, useState } from 'react'
import { Package, Truck, MapPin, Loader2 } from 'lucide-react'
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function DeliverySelector() {
  const baseId = useId()

  // Store state
  const deliveryMode  = useCheckoutStore((s) => s.deliveryMode)
  const timeSlot      = useCheckoutStore((s) => s.timeSlot)
  const address       = useCheckoutStore((s) => s.address)

  // Store actions
  const setDeliveryMode = useCheckoutStore((s) => s.setDeliveryMode)
  const setTimeSlot     = useCheckoutStore((s) => s.setTimeSlot)
  const setAddress      = useCheckoutStore((s) => s.setAddress)

  // Local UI state for geolocation
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError,   setGeoError]   = useState<string | null>(null)

  // Controlled input value — mirrors store, but also reflects text typed
  // before committing (we commit on every keystroke via setAddress)
  const addressInputRef = useRef<HTMLInputElement>(null)

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleModeChange(mode: DeliveryMode) {
    // setDeliveryMode internally clears incompatible fields
    setDeliveryMode(mode)
    setGeoError(null)
  }

  function handleTimeSlotChange(slot: TimeSlot) {
    setTimeSlot(slot)
  }

  function handleAddressInput(e: React.ChangeEvent<HTMLInputElement>) {
    // Clear geo-coords when user types manually (no lat/lng)
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
        // We don't reverse-geocode — store lat/lng + a readable label
        setAddress('Mi ubicación actual', latitude, longitude)
        setGeoLoading(false)
      },
      (_err) => {
        setGeoError('No se pudo obtener tu ubicación. Ingresa la dirección manualmente.')
        setGeoLoading(false)
      },
      { timeout: 10000, enableHighAccuracy: false },
    )
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isPickup   = deliveryMode === 'pickup'
  const isDelivery = deliveryMode === 'delivery'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section aria-labelledby={`${baseId}-heading`} className="space-y-3">
      {/* Section heading */}
      <h2
        id={`${baseId}-heading`}
        className="text-base font-semibold text-brand-dark"
      >
        ¿Cómo prefieres tu pedido?
      </h2>

      {/* ── Mode toggle ─────────────────────────────────────────────────── */}
      <div
        role="group"
        aria-labelledby={`${baseId}-heading`}
        className="grid grid-cols-2 gap-3"
      >
        {/* Pickup option */}
        <button
          type="button"
          onClick={() => handleModeChange('pickup')}
          aria-pressed={isPickup}
          className={[
            'flex min-h-12 flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
            isPickup
              ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
              : 'border-brand-border bg-brand-surface text-brand-dark hover:bg-gray-50',
          ].join(' ')}
        >
          <Package
            size={24}
            aria-hidden="true"
            className={isPickup ? 'text-brand-primary' : 'text-brand-muted'}
          />
          <span>Recoger en tienda</span>
        </button>

        {/* Delivery option */}
        <button
          type="button"
          onClick={() => handleModeChange('delivery')}
          aria-pressed={isDelivery}
          className={[
            'flex min-h-12 flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
            isDelivery
              ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
              : 'border-brand-border bg-brand-surface text-brand-dark hover:bg-gray-50',
          ].join(' ')}
        >
          <Truck
            size={24}
            aria-hidden="true"
            className={isDelivery ? 'text-brand-primary' : 'text-brand-muted'}
          />
          <span>Domicilio</span>
        </button>
      </div>

      {/* ── Pickup sub-panel: time slot ──────────────────────────────────── */}
      {isPickup && (
        <div className="animate-slide-in-top rounded-xl border border-brand-border bg-brand-surface p-4">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-brand-dark">
              ¿A qué hora lo recoges?
            </legend>

            <div className="space-y-2">
              {TIME_SLOT_OPTIONS.map((option) => {
                const inputId = `${baseId}-slot-${option.value}`
                const isChecked = timeSlot === option.value

                return (
                  <label
                    key={option.value}
                    htmlFor={inputId}
                    className={[
                      'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 transition-colors',
                      isChecked
                        ? 'border-brand-primary bg-brand-primary/10'
                        : 'border-brand-border bg-white hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name={`${baseId}-timeslot`}
                      value={option.value}
                      checked={isChecked}
                      onChange={() => handleTimeSlotChange(option.value)}
                      className="h-4 w-4 cursor-pointer accent-brand-primary"
                    />
                    <span className="flex flex-col">
                      <span
                        className={[
                          'text-sm font-medium',
                          isChecked ? 'text-brand-primary' : 'text-brand-dark',
                        ].join(' ')}
                      >
                        {option.label}
                      </span>
                      <span className="text-xs text-brand-muted">{option.description}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </div>
      )}

      {/* ── Delivery sub-panel: address ───────────────────────────────────── */}
      {isDelivery && (
        <div className="animate-slide-in-top rounded-xl border border-brand-border bg-brand-surface p-4 space-y-3">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-brand-dark">
              Dirección de entrega
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
                  'block w-full min-h-12 rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-brand-dark placeholder:text-gray-400 outline-none transition',
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
                'mt-3 flex w-full min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-brand-primary px-4 py-3 text-sm font-medium text-brand-primary transition-colors',
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

            {/* Inline geolocation error — does not unmount the UI */}
            {geoError && (
              <p
                role="alert"
                aria-live="polite"
                className="mt-2 rounded-lg bg-brand-warning-bg px-3 py-2 text-xs font-medium text-brand-warning"
              >
                {geoError}
              </p>
            )}
          </fieldset>
        </div>
      )}
    </section>
  )
}
