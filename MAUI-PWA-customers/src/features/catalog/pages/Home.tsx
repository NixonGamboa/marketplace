import { useNavigate } from 'react-router-dom'
import { useFeaturedProducts, useCategories } from '@/hooks'
import { useAddToCart, useCart } from '@/hooks'
import Carousel from '@/shared/components/ui/Carousel'
import ProductCard from '../components/ProductCard'
import { ProductCardSkeleton } from '../components/ProductCardSkeleton'
import { StoreStatusBanner } from '../components/StoreStatusBanner'
import { PasillosGrid } from '../components/PasillosGrid'
import { ReorderBanner } from '@/features/orders/components/ReorderBanner'

export default function Home() {
  const navigate = useNavigate()
  const addToCart = useAddToCart()
  const { items } = useCart()
  const { data: featured, isLoading: loadingFeatured } = useFeaturedProducts()
  const { data: categories, isLoading: loadingCats } = useCategories()

  const cartProductIds = new Set(items.map((i) => i.productId))

  return (
    <div className="pb-4">
      <StoreStatusBanner />
      <ReorderBanner />

      {/* Lo que no puede faltar */}
      <section aria-labelledby="featured-heading" className="px-4 pt-5 pb-4">
        <h2 id="featured-heading" className="text-base font-semibold text-brand-dark mb-3">
          Lo que no puede faltar
        </h2>
        {loadingFeatured ? (
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-40 flex-shrink-0">
                <ProductCardSkeleton />
              </div>
            ))}
          </div>
        ) : (
          <Carousel
            visible={{ base: 2, sm: 3, md: 4 }}
            controlsBreakpoint="sm"
            ariaLabel="Productos destacados"
            indicators={false}
          >
            {(featured ?? []).map((product) => (
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
          </Carousel>
        )}
      </section>

      {/* Pasillos */}
      <section aria-labelledby="pasillos-heading" className="px-4 pt-2 pb-4">
        <h2 id="pasillos-heading" className="text-base font-semibold text-brand-dark mb-3">
          Pasillos
        </h2>
        {loadingCats ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-brand-border/30 animate-pulse" />
            ))}
          </div>
        ) : (
          <PasillosGrid
            categories={categories ?? []}
            onSelect={(cat) => navigate(`/catalog/${cat.slug ?? cat.id}`)}
          />
        )}
      </section>
    </div>
  )
}
