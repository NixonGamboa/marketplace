import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { heroSupermercadoAbarrotes } from '@/assets/hero'
import { bannerAhorraMauiPlus } from '@/assets/banners'
import { promoEnvioGratis } from '@/assets/promos'
import { useFeaturedProducts } from '@/hooks'
import { useAddToCart, useCart } from '@/hooks'
import ProductCard from '../components/ProductCard'
import { ProductCardSkeleton } from '../components/ProductCardSkeleton'

// ── Sidebar categories ────────────────────────────────────────────────────────
const SIDEBAR_CATS = [
  { id: 'all',    name: 'Inicio',            icon: '🏠', slug: null },
  { id: 'cat-fv', name: 'Frutas y Verduras', icon: '🥦', slug: 'frutas-verduras' },
  { id: 'cat-ca', name: 'Carnes y Pollo',    icon: '🥩', slug: 'carnes' },
  { id: 'cat-la', name: 'Lácteos y Huevos',  icon: '🥛', slug: 'lacteos' },
  { id: 'cat-ab', name: 'Despensa',          icon: '🛒', slug: 'despensa' },
  { id: 'cat-be', name: 'Bebidas',           icon: '🧃', slug: 'bebidas' },
  { id: 'cat-as', name: 'Limpieza',          icon: '🧹', slug: 'aseo' },
  { id: 'cat-cp', name: 'Cuidado Personal',  icon: '🧴', slug: null },
  { id: 'cat-sn', name: 'Snacks y Dulces',   icon: '🍫', slug: null },
  { id: 'cat-co', name: 'Congelados',        icon: '🧊', slug: null },
]

const BENEFITS = [
  { icon: '🚚', title: 'Envío rápido',          sub: 'Entrega en 24-48h' },
  { icon: '🔒', title: 'Pago seguro',            sub: 'Compras protegidas' },
  { icon: '⭐', title: 'Calidad garantizada',    sub: 'Productos seleccionados' },
  { icon: '💬', title: 'Atención al cliente',   sub: 'Estamos para ayudarte' },
]

const TRUST = ['🌿 Productos 100% frescos', '💰 Precios justos todos los días', '🤝 Apoyamos lo local']

export default function Home() {
  const navigate = useNavigate()
  const addToCart = useAddToCart()
  const { items } = useCart()
  const [activeCategory, setActiveCategory] = useState('all')
  const { data: featured, isLoading } = useFeaturedProducts()

  const cartProductIds = new Set(items.map((i) => i.productId))

  const handleCategory = (cat: (typeof SIDEBAR_CATS)[0]) => {
    setActiveCategory(cat.id)
    if (cat.slug) navigate(`/catalog/${cat.slug}`)
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-5 flex gap-5">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 gap-3" aria-label="Categorías">
        {/* Menú de categorías */}
        <nav className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
          <ul role="list">
            {SIDEBAR_CATS.map((cat) => {
              const active = activeCategory === cat.id
              return (
                <li key={cat.id}>
                  <button
                    onClick={() => handleCategory(cat)}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-left transition-colors',
                      active
                        ? 'bg-brand-primary/10 text-brand-primary font-semibold border-l-2 border-brand-primary'
                        : 'text-brand-dark hover:bg-brand-bg',
                    ].join(' ')}
                  >
                    <span className="text-lg leading-none">{cat.icon}</span>
                    <span className="leading-snug">{cat.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Promo envío gratis */}
        <div className="rounded-2xl overflow-hidden shadow-brand-sm">
          <img
            src={promoEnvioGratis}
            alt="Envío gratis desde $30.000"
            className="w-full h-auto object-cover"
            draggable={false}
          />
        </div>
      </aside>

      {/* ── Contenido principal ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">

        {/* Categorías horizontales móvil */}
        <div className="lg:hidden flex gap-2 overflow-x-auto no-scrollbar pb-1" role="list" aria-label="Categorías">
          {SIDEBAR_CATS.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategory(cat)}
              role="listitem"
              className={[
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border',
                activeCategory === cat.id
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-white text-brand-dark border-brand-border hover:border-brand-primary/40',
              ].join(' ')}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section
          aria-label="Banner principal"
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#f0fdf4] via-[#dcfce7] to-[#bbf7d0] border border-green-100 p-6 md:p-8 flex items-center gap-6 min-h-[200px]"
        >
          {/* Texto */}
          <div className="flex-1 z-10">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-widest mb-2">
              🌿 Fresco · Local · Rápido
            </p>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#1F2937] leading-tight mb-3">
              Productos frescos<br />todos los días
            </h1>
            <p className="text-[#6B7280] text-sm mb-5 max-w-xs leading-relaxed">
              Frutas, verduras y mucho más, directo a tu hogar con la mejor calidad.
            </p>
            <button
              onClick={() => navigate('/catalog/frutas-verduras')}
              className="bg-[#16a34a] hover:bg-[#15803d] active:bg-[#166534] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
            >
              Comprar ahora
            </button>
          </div>

          {/* Imagen hero */}
          <div className="hidden sm:block shrink-0 self-stretch">
            <img
              src={heroSupermercadoAbarrotes}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="h-full w-auto max-w-[320px] md:max-w-[400px] object-contain object-right select-none"
            />
          </div>

          {/* Decoración de fondo */}
          <div
            aria-hidden="true"
            className="absolute -right-10 -bottom-10 w-48 h-48 bg-green-200/30 rounded-full"
          />
          <div
            aria-hidden="true"
            className="absolute -left-6 -top-6 w-32 h-32 bg-green-100/50 rounded-full"
          />
        </section>

        {/* ── Beneficios ──────────────────────────────────────────────────────── */}
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
          aria-label="Beneficios de comprar en MAUI"
        >
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="bg-white rounded-xl border border-brand-border p-3 flex items-center gap-3 shadow-card"
            >
              <span className="text-2xl leading-none">{b.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand-dark leading-tight">{b.title}</p>
                <p className="text-[11px] text-brand-muted mt-0.5 leading-tight">{b.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Productos + Promo ────────────────────────────────────────────────── */}
        <div className="flex gap-4 items-start">
          {/* Sección de productos */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-brand-dark">Ofertas del día 🔥</h2>
              <button
                onClick={() => navigate('/catalog/frutas-verduras')}
                className="text-brand-primary text-sm font-semibold hover:underline underline-offset-2 transition-colors"
              >
                Ver todas →
              </button>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {(featured ?? []).slice(0, 8).map((product) => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name_display ?? product.name}
                    image={product.imageUrl}
                    price={product.price}
                    originalPrice={product.originalPrice}
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

          {/* MAUI Plus promo — solo pantallas grandes */}
          <aside
            aria-label="MAUI Plus"
            className="hidden xl:block w-48 shrink-0 sticky top-24"
          >
            <div className="rounded-2xl overflow-hidden shadow-brand-md">
              <img
                src={bannerAhorraMauiPlus}
                alt="MAUI Plus — Descuentos exclusivos y envíos gratis siempre"
                className="w-full h-auto object-cover"
                draggable={false}
              />
            </div>
          </aside>
        </div>

        {/* ── Trust bar ───────────────────────────────────────────────────────── */}
        <div
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 border-t border-brand-border"
          aria-label="Compromisos MAUI"
        >
          {TRUST.map((text) => (
            <span key={text} className="text-xs text-brand-muted font-medium">
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
