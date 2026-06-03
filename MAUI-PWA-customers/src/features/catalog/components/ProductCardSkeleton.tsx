interface ProductCardSkeletonProps {
  className?: string
}

export function ProductCardSkeleton({ className = '' }: ProductCardSkeletonProps) {
  return (
    <div
      className={[
        'rounded-2xl border border-brand-border bg-white overflow-hidden animate-pulse',
        className,
      ].join(' ')}
    >
      {/* Imagen placeholder */}
      <div className="aspect-square w-full bg-gray-100" />
      {/* Info placeholder */}
      <div className="p-3 space-y-2.5">
        <div className="h-3 bg-gray-100 rounded-lg w-3/4" />
        <div className="h-3 bg-gray-100 rounded-lg w-1/2" />
        <div className="h-8 bg-brand-primary/10 rounded-lg mt-2" />
      </div>
    </div>
  )
}
