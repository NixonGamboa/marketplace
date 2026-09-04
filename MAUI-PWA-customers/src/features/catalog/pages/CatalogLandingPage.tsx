import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCategories } from '@/hooks'

export default function CatalogLandingPage() {
  const { data: categories, isLoading } = useCategories()

  return (
    <main className="min-h-screen bg-brand-bg">
      <header className="sticky top-0 z-10 bg-brand-surface border-b border-brand-border px-4 py-3 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Volver al inicio"
          className="flex items-center justify-center w-9 h-9 rounded-full text-brand-dark hover:bg-brand-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="text-base font-semibold text-brand-dark">Todos los pasillos</h1>
      </header>

      <div className="px-4 pt-5 pb-24">
        {isLoading && (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3" aria-busy="true">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-brand-border/30 animate-pulse aspect-square"
              />
            ))}
          </div>
        )}

        {!isLoading && categories && (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {categories
              .slice()
              .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
              .map((cat) => (
                <Link
                  key={cat.id}
                  to={`/catalog/${cat.slug ?? cat.id}`}
                  className="flex flex-col items-center justify-center gap-2.5 rounded-2xl p-3 bg-brand-surface border border-brand-border text-center hover:border-brand-primary/40 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                >
                  {cat.illustrationUrl ? (
                    <img
                      src={cat.illustrationUrl}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="w-10 h-10 object-contain"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary text-xl font-bold">
                      {cat.name.charAt(0)}
                    </span>
                  )}
                  <span className="text-xs font-semibold text-brand-dark leading-tight line-clamp-2">
                    {cat.name}
                  </span>
                </Link>
              ))}
          </div>
        )}
      </div>
    </main>
  )
}
