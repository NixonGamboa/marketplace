import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useProducts, useCategories } from '@/hooks'
import { useAddToCart, useCart } from '@/hooks'
import ProductCard from '../components/ProductCard'
import { ProductCardSkeleton } from '../components/ProductCardSkeleton'

const SKELETON_COUNT = 8

export default function CatalogPage() {
  const { categoryId } = useParams<{ categoryId: string }>()

  const { data: allProducts, isLoading: loadingProducts } = useProducts()
  const { data: categories, isLoading: loadingCats } = useCategories()

  const addToCart = useAddToCart()
  const { items } = useCart()
  const cartProductIds = new Set(items.map((i) => i.productId))

  const isLoading = loadingProducts || loadingCats

  // Match category by id or slug (PasillosGrid navigates with `cat.slug ?? cat.id`)
  const category = categories?.find(
    (cat) => cat.id === categoryId || cat.slug === categoryId,
  )

  // Filter products for this category using the resolved id
  const resolvedId = category?.id ?? categoryId
  const products = (allProducts ?? []).filter((p) => p.categoryId === resolvedId)

  // Category not found (data loaded but no match)
  const notFound = !isLoading && !category

  return (
    <main className="min-h-screen bg-brand-bg">
      {/* ── Header / Breadcrumb ─────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-brand-surface border-b border-brand-border px-4 py-3 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Volver al inicio"
          className="flex items-center justify-center w-9 h-9 rounded-full text-brand-dark hover:bg-brand-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>

        <nav aria-label="Migas de pan">
          <ol className="flex items-center gap-1.5 text-sm">
            <li>
              <Link
                to="/"
                className="text-brand-muted hover:text-brand-primary transition-colors"
              >
                Inicio
              </Link>
            </li>
            <li aria-hidden="true" className="text-brand-border select-none">
              /
            </li>
            <li
              className="text-brand-dark font-medium truncate max-w-[180px]"
              aria-current="page"
            >
              {isLoading ? (
                <span className="inline-block h-4 w-28 bg-brand-border/40 rounded animate-pulse" />
              ) : (
                category?.name ?? 'Pasillo'
              )}
            </li>
          </ol>
        </nav>
      </header>

      <div className="px-4 pt-5 pb-24">
        {/* ── Page title ──────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="h-6 w-40 bg-brand-border/40 rounded animate-pulse mb-5" />
        ) : (
          <h1 className="text-xl font-semibold text-brand-dark mb-5">
            {notFound ? 'Pasillo no encontrado' : `Pasillo: ${category!.name}`}
          </h1>
        )}

        {/* ── Loading state: skeleton grid ────────────────────────────── */}
        {isLoading && (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
            aria-busy="true"
            aria-label="Cargando productos"
          >
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* ── Not found state ─────────────────────────────────────────── */}
        {!isLoading && notFound && (
          <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
            <p className="text-brand-muted text-base">Pasillo no encontrado</p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-brand-sm hover:bg-brand-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-colors"
            >
              Volver al inicio
            </Link>
          </div>
        )}

        {/* ── Empty state: category exists but has no products ────────── */}
        {!isLoading && !notFound && products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
            <p className="text-brand-muted text-base">
              No hay productos en este pasillo
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-brand-sm hover:bg-brand-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-colors"
            >
              Volver al inicio
            </Link>
          </div>
        )}

        {/* ── Success state: product grid ──────────────────────────────── */}
        {!isLoading && !notFound && products.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((product) => (
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
        )}
      </div>
    </main>
  )
}
