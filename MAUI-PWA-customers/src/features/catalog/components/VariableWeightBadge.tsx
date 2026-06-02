interface VariableWeightBadgeProps {
  compact?: boolean
  className?: string
}

export function VariableWeightBadge({ compact = true, className = '' }: VariableWeightBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center bg-brand-warning-bg text-brand-warning text-xs font-medium px-2 py-0.5 rounded-full',
        className,
      ].join(' ')}
    >
      {compact ? 'Peso variable' : 'Peso y precio final se ajustan en tienda'}
    </span>
  )
}
