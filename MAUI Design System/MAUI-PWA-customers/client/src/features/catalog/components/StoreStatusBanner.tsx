import { STORE_SCHEDULE } from '@/config/app'

interface StoreStatusBannerProps {
  isOpen?: boolean
  scheduleLabel?: string
  deliveryCutoff?: string
  className?: string
}

function deriveIsOpen(): boolean {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 6=Sat
  if (day === 0) return false // cerrado domingos

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
        'flex items-center gap-2 px-4 py-2 text-sm font-medium',
        open
          ? 'bg-green-50 text-brand-primary border-b border-green-100'
          : 'bg-red-50 text-brand-error border-b border-red-100',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'inline-block w-2 h-2 rounded-full flex-shrink-0',
          open ? 'bg-brand-primary' : 'bg-brand-error',
        ].join(' ')}
        aria-hidden="true"
      />
      {open ? (
        <>
          <span>Abierto</span>
          <span className="text-brand-muted font-normal">·</span>
          <span className="text-brand-muted font-normal">{scheduleLabel}</span>
          <span className="text-brand-muted font-normal">·</span>
          <span className="text-brand-muted font-normal">{deliveryCutoff}</span>
        </>
      ) : (
        <>
          <span>Cerrado ahora</span>
          <span className="text-brand-muted font-normal">·</span>
          <span className="text-brand-muted font-normal">{scheduleLabel}</span>
        </>
      )}
    </div>
  )
}
