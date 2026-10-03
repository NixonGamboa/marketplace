interface CatalogErrorProps {
  onRetry(): void
  message?: string
}

/** Fallo de la carga del catálogo: se informa y se ofrece reintentar (nunca se muestra como «sin productos»). */
export function CatalogError({
  onRetry,
  message = 'No pudimos cargar el catálogo. Verifica tu conexión e intenta de nuevo.',
}: CatalogErrorProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <p className="text-brand-muted text-sm max-w-xs">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-5 py-2.5 bg-brand-primary text-white rounded-xl font-semibold text-sm hover:bg-brand-primary-dark transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}
