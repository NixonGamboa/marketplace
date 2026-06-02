interface ProductCardSkeletonProps {
  className?: string
}

export function ProductCardSkeleton({ className = '' }: ProductCardSkeletonProps) {
  return (
    <div className={['rounded-xl bg-brand-border/20 animate-pulse overflow-hidden', className].join(' ')}>
      <div className="aspect-square w-full bg-brand-border/40" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-brand-border/50 rounded w-3/4" />
        <div className="h-3 bg-brand-border/50 rounded w-1/2" />
        <div className="h-8 bg-brand-primary/20 rounded mt-2" />
      </div>
    </div>
  )
}
