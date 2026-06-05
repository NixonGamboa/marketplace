import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Home as HomeIcon,
  Leaf,
  Utensils,
  Milk,
  ShoppingBasket,
  GlassWater,
  Sparkles,
  User,
  Cookie,
  Snowflake,
  Truck,
  ShieldCheck,
  Award,
  MessageCircle,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import HeroCarousel from '../components/HeroCarousel'
import { heroSlides } from '@/assets/hero'
import { bannerAhorraMauiPlus } from '@/assets/banners'
import { promoEnvioGratis } from '@/assets/promos'
import { useFeaturedProducts } from '@/hooks'
import { useAddToCart, useCart } from '@/hooks'
import ProductCard from '../components/ProductCard'
import { ProductCardSkeleton } from '../components/ProductCardSkeleton'

// ── Sidebar categories ────────────────────────────────────────────────────────
const SIDEBAR_CATS: { id: string; name: string; Icon: LucideIcon; slug: string | null }[] = [
  { id: 'all',     name: 'Inicio',            Icon: HomeIcon,       slug: null },
  { id: 'cat-fv',  name: 'Frutas y Verduras', Icon: Leaf,           slug: 'frutas-verduras' },
  { id: 'cat-ca',  name: 'Carnes y Pollo',    Icon: Utensils,       slug: 'carnes' },
  { id: 'cat-la',  name: 'Lácteos y Huevos',  Icon: Milk,           slug: 'lacteos' },
  { id: 'cat-ab',  name: 'Despensa',          Icon: ShoppingBasket, slug: 'despensa' },
  { id: 'cat-be',  name: 'Bebidas',           Icon: GlassWater,     slug: 'bebidas' },
  { id: 'cat-as',  name: 'Limpieza',          Icon: Sparkles,       slug: 'aseo' },
  { id: 'cat-cp',  name: 'Cuidado Personal',  Icon: User,           slug: null },
  { id: 'cat-sn',  name: 'Snacks y Dulces',   Icon: Cookie,         slug: null },
  { id: 'cat-co',  name: 'Congelados',        Icon: Snowflake,      slug: null },
]

const BENEFITS: { Icon: LucideIcon; title: string; sub: string }[] = [
  { Icon: Truck,         title: 'Envío rápido',        sub: 'Entrega en 2-4h' },
  { Icon: ShieldCheck,   title: 'Pago contraentrega',   sub: 'Pagas al recibir' },
  { Icon: Award,         title: 'Calidad garantizada',  sub: 'Productos seleccionados' },
  { Icon: MessageCircle, title: 'Atención al cliente',  sub: 'Estamos para ayudarte' },
]

const TRUST = ['Productos 100% frescos', 'Precios justos todos los días', 'Apoyamos lo local']

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
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-4 md:py-6 flex gap-4 md:gap-6">
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
                    <cat.Icon
                      size={18}
                      className={active ? 'text-brand-primary' : 'text-brand-muted'}
                      strokeWidth={1.8}
                    />
                    <span className="leading-snug">{cat.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Promo envío gratis */}
        <div className="rounded-2xl overflow-hidden shadow-brand-sm relative aspect-square">
          <img
            src={promoEnvioGratis}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="relative z-10 p-4 flex flex-col">
            <p className="text-[15px] font-bold text-brand-primary leading-tight">Envío gratis</p>
            <p className="text-[11px] text-brand-muted mt-1 leading-snug">En compras superiores a</p>
            <p className="text-[26px] font-extrabold text-brand-primary mt-0.5 leading-none">$30.000</p>
          </div>
        </div>
      </aside>

      {/* ── Contenido principal ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4 md:gap-6">

        {/* Categorías horizontales móvil */}
        <div className="lg:hidden relative">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="list" aria-label="Categorías">
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
                <cat.Icon size={13} strokeWidth={2} />
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
          <div className="absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-brand-bg to-transparent pointer-events-none" />
        </div>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <HeroCarousel slides={heroSlides} />

        {/* Promo envío gratis — solo móvil */}
        <div className="lg:hidden relative h-20 rounded-2xl overflow-hidden shadow-brand-sm">
          <img
            src={promoEnvioGratis}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover object-right"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/65 to-transparent" />
          <div className="relative z-10 px-4 h-full flex flex-col justify-center">
            <p className="text-[13px] font-bold text-brand-primary leading-tight">Envío gratis</p>
            <p className="text-[11px] text-brand-muted leading-snug">
              En compras superiores a <span className="font-bold text-brand-primary">$30.000</span>
            </p>
          </div>
        </div>

        {/* ── Beneficios ──────────────────────────────────────────────────────── */}
        <div
          className="flex gap-3 overflow-x-auto no-scrollbar pb-1 md:grid md:grid-cols-4 md:overflow-visible md:pb-0"
          aria-label="Beneficios de comprar en MAUI"
        >
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="shrink-0 w-44 md:w-auto bg-white rounded-xl border border-brand-border p-3 flex items-center gap-3 shadow-card"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-primary-light flex items-center justify-center shrink-0">
                <b.Icon size={18} className="text-brand-primary" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand-dark leading-tight">{b.title}</p>
                <p className="text-[11px] text-brand-muted mt-0.5 leading-tight">{b.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Productos + Promo ────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-brand-dark">Ofertas del día 🔥</h2>
            <button
              onClick={() => navigate('/catalog/frutas-verduras')}
              className="text-brand-primary text-xs font-semibold hover:underline underline-offset-2 transition-colors"
            >
              <span className="inline-flex items-center gap-0.5">Ver todas las ofertas <ChevronRight size={14} /></span>
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3">
              {(featured ?? []).slice(0, 4).map((product) => (
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

              {/* MAUI Plus — full-width en móvil/md, 5.º slot en XL */}
              <div
                aria-label="MAUI Plus"
                className="col-span-2 md:col-span-3 xl:col-span-1 flex rounded-2xl overflow-hidden shadow-brand-md relative min-h-[110px] xl:min-h-0"
              >
                <img
                  src={bannerAhorraMauiPlus}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50" />
                <div className="relative z-10 p-3 xl:p-4 flex items-center gap-3 xl:flex-col xl:items-stretch xl:justify-between w-full">
                  <div className="flex-1">
                    <p className="text-white/85 text-[11px] font-medium leading-tight">Ahorra más con</p>
                    <p className="text-white text-base font-extrabold leading-tight">MAUI Plus</p>
                    <p className="text-white/90 text-[11px] leading-snug mt-1 xl:hidden">
                      Descuentos exclusivos y envíos gratis siempre
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0 xl:shrink">
                    <p className="text-white/90 text-[11px] leading-snug hidden xl:block">
                      Descuentos exclusivos y envíos gratis siempre
                    </p>
                    <button className="py-2 px-3 xl:w-full rounded-xl bg-white/15 border border-white/50 text-white text-xs font-semibold hover:bg-white/25 transition-colors inline-flex items-center justify-center gap-1">
                      Conocer más <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
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
