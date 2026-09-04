import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search as SearchIcon } from 'lucide-react'
import { useProducts, useAddToCart, useCart } from '@/hooks'
import ProductCard from '../components/ProductCard'
import { ProductCardSkeleton } from '../components/ProductCardSkeleton'

const SKELETON_COUNT = 8

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const rawQuery = searchParams.get('q') ?? ''
  const query = rawQuery.trim()

  const { data: allProducts, isLoading } = useProducts()
  const addToCart = useAddToCart()
  const { items } = useCart()
  const cartProductIds = new Set(items.map((i) => i.productId))

  const results = useMemo(() => {
    if (!query || !allProducts) return []
    const needle = normalize(query)
    return allProducts.filter((p) => {
      const haystack = [p.name, p.name_display, p.name_legal]
        .filter(Boolean)
        .map((s) => normalize(String(s)))
      return haystack.some((h) => h.includes(needle))
    })
  }, [allProducts, query])

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
        <div className="flex items-center gap-2 text-sm">
          <SearchIcon size={16} className="text-brand-muted" aria-hidden="true" />
          <span className="text-brand-muted">Resultados para</span>
          <span className="text-brand-dark font-semibold truncate max-w-[180px]">
            {query || '—'}
          </span>
        </div>
      </header>

      <div className="px-4 pt-5 pb-24">
        {!query && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-brand-muted text-base">
              Escribe algo en el buscador para encontrar productos.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-brand-sm hover:bg-brand-primary-dark transition-colors"
            >
              Volver al inicio
            </Link>
          </div>
        )}

        {query && isLoading && (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
            aria-busy="true"
            aria-label="Buscando productos"
          >
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        )}

        {query && !isLoading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-brand-dark text-base font-medium">
              Sin resultados para "{query}"
            </p>
            <p className="text-brand-muted text-sm max-w-xs">
              Probá con otra palabra o navegá las categorías desde el inicio.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-brand-sm hover:bg-brand-primary-dark transition-colors mt-2"
            >
              Volver al inicio
            </Link>
          </div>
        )}

        {query && !isLoading && results.length > 0 && (
          <>
            <h1 className="text-xl font-semibold text-brand-dark mb-5">
              {results.length} {results.length === 1 ? 'producto' : 'productos'}
            </h1>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {results.map((product) => (
                <ProductCard
                  key={product.id}
                  id={product.id}
                  name={product.name_display ?? product.name}
                  image={product.imageUrl}
                  price={product.price}
                  unit={product.unit}
                  currency={product.currency}
                  inStock={product.inStock}
                  is_variable_weight={product.is_variable_weight}
                  badge={product.badge}
                  added={cartProductIds.has(product.id)}
                  onAdd={() => addToCart(product)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
