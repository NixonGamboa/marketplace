interface VariableWeightBadgeProps {
  compact?: boolean
  className?: string
}

export function VariableWeightBadge({ compact = true, className = '' }: VariableWeightBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 bg-brand-warning-bg text-brand-warning text-[11px] font-semibold px-2 py-0.5 rounded-full',
        className,
      ].join(' ')}
    >
      <span aria-hidden="true">⚖️</span>
      {compact ? 'Peso variable' : 'Peso y precio final se ajustan en tienda'}
    </span>
  )
}
