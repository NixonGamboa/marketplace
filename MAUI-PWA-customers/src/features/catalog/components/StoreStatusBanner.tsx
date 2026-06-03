import { STORE_SCHEDULE } from '@/config/app'

interface StoreStatusBannerProps {
  isOpen?: boolean
  scheduleLabel?: string
  deliveryCutoff?: string
  className?: string
}

function deriveIsOpen(): boolean {
  const now = new Date()
  const day = now.getDay()
  if (day === 0) return false

  const [openH, openM] = STORE_SCHEDULE.open.split(':').map(Number)
  const [closeH, closeM] = STORE_SCHEDULE.close.split(':').map(Number)
  const mins = now.getHours() * 60 + now.getMinutes()
  const openMins = openH * 60 + openM
  const closeMins = closeH * 60 + closeM
  return mins >= openMins && mins < closeMins
}

export function StoreStatusBanner({
  isOpen,
  scheduleLabel = STORE_SCHEDULE.scheduleLabel,
  deliveryCutoff = STORE_SCHEDULE.deliveryCutoff,
  className = '',
}: StoreStatusBannerProps) {
  const open = isOpen !== undefined ? isOpen : deriveIsOpen()

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex items-center gap-2.5 px-4 py-2.5 text-sm border-b',
        open
          ? 'bg-brand-primary-light text-brand-primary border-brand-primary/15'
          : 'bg-red-50 text-brand-error border-red-100',
        className,
      ].join(' ')}
    >
      {/* Indicador de estado */}
      <span
        className={[
          'inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0',
          open ? 'bg-brand-primary/15' : 'bg-brand-error/15',
        ].join(' ')}
        aria-hidden="true"
      >
        <span
          className={[
            'inline-block w-2 h-2 rounded-full',
            open ? 'bg-brand-primary animate-pulse' : 'bg-brand-error',
          ].join(' ')}
        />
      </span>

      <span className="font-semibold">{open ? 'Abierto' : 'Cerrado ahora'}</span>

      <span className="text-brand-muted hidden xs:block">·</span>
      <span className="text-brand-muted text-xs hidden xs:block">{scheduleLabel}</span>

      {open && deliveryCutoff && (
        <>
          <span className="text-brand-muted hidden sm:block">·</span>
          <span className="text-brand-muted text-xs hidden sm:block">{deliveryCutoff}</span>
        </>
      )}
    </div>
  )
}
