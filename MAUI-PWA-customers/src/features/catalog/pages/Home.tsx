import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Leaf,
  Utensils,
  Milk,
  ShoppingBasket,
  GlassWater,
  Sparkles,
  Cookie,
  Snowflake,
  Truck,
  ShieldCheck,
  Award,
  MessageCircle,
  ChevronRight,
  Store,
  Wrench,
  PawPrint,
  WashingMachine,
  Zap,
  Car,
  UtensilsCrossed,
  Home as HomeIconLucide,
  Tag,
  Star,
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

// ── Business Categories (menú lateral — verticales de la plataforma) ─────────
interface BusinessCategory {
  id: string
  name: string
  Icon: LucideIcon
  slug: string | null
  soon?: boolean
}

const BCATS_COMPRAR: BusinessCategory[] = [
  { id: 'mercado',        name: 'Mercado',           Icon: Store,    slug: null,              soon: false },
  { id: 'cat-fv',        name: 'Frutas y Verduras', Icon: Leaf,     slug: 'frutas-verduras', soon: true },
  { id: 'cat-ca',        name: 'Carnes Frescas',    Icon: Utensils, slug: 'carnes',          soon: true },
  { id: 'ferreteria',    name: 'Ferretería',        Icon: Wrench,   slug: null,              soon: true },
  { id: 'electro',       name: 'Electrodomésticos', Icon: Zap,            slug: null,        soon: true },
  { id: 'mascotas',      name: 'Mascotas',          Icon: PawPrint, slug: null,              soon: true },
]

const BCATS_SERVICIOS: BusinessCategory[] = [
  { id: 'transporte',    name: 'Transporte',         Icon: Car,              slug: null, soon: true },
  { id: 'domicilios',    name: 'Domicilios',         Icon: Truck,            slug: null, soon: true },
  { id: 'hogar',         name: 'Hogar',              Icon: HomeIconLucide,   slug: null, soon: true },
]

const BCATS_COMUNIDAD: BusinessCategory[] = [
  { id: 'promos-locales', name: 'Promociones locales',  Icon: Tag,  slug: null, soon: true },
  { id: 'negocios',       name: 'Negocios destacados',  Icon: Star, slug: null, soon: true },
]

// ── Categories (catálogo — agrupaciones de producto) ─────────────────────────
const CATEGORIES: { id: string; name: string; Icon: LucideIcon; slug: string | null }[] = [
  { id: 'mercado',   name: 'Mercado',           Icon: Store,          slug: null },
  { id: 'lacteos',   name: 'Lácteos',           Icon: Milk,           slug: 'lacteos' },
  { id: 'bebidas',   name: 'Bebidas',           Icon: GlassWater,     slug: 'bebidas' },
  { id: 'limpieza',  name: 'Limpieza',          Icon: Sparkles,       slug: 'aseo' },
  { id: 'snacks',    name: 'Snacks',            Icon: Cookie,         slug: null },
  { id: 'despensa',  name: 'Despensa',          Icon: ShoppingBasket, slug: 'despensa' },
  { id: 'fv',        name: 'Frutas y Verduras', Icon: Leaf,           slug: 'frutas-verduras' },
  { id: 'carnes',    name: 'Carnes',            Icon: UtensilsCrossed,slug: 'carnes' },
  { id: 'congelados',name: 'Congelados',        Icon: Snowflake,      slug: null },
]

// ── Business Categories (versión móvil — scroll horizontal) ──────────────────
const MOBILE_BCATS: BusinessCategory[] = [
  { id: 'mercado',   name: 'Mercado',           Icon: Store,          slug: null },
  { id: 'cat-fv',   name: 'Frutas y Verduras', Icon: Leaf,           slug: 'frutas-verduras' },
  { id: 'cat-ca',   name: 'Carnes',            Icon: Utensils,       slug: 'carnes' },
  { id: 'cat-la',   name: 'Lácteos',           Icon: Milk,           slug: 'lacteos' },
  { id: 'cat-ab',   name: 'Despensa',          Icon: ShoppingBasket, slug: 'despensa' },
  { id: 'cat-be',   name: 'Bebidas',           Icon: GlassWater,     slug: 'bebidas' },
  { id: 'cat-as',   name: 'Limpieza',          Icon: Sparkles,       slug: 'aseo' },
  { id: 'cat-sn',   name: 'Snacks',            Icon: Cookie,         slug: null },
  { id: 'cat-co',   name: 'Congelados',        Icon: Snowflake,      slug: null },
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
  const [activeBusinessCategory, setActiveBusinessCategory] = useState('mercado')
  const { data: featured, isLoading } = useFeaturedProducts()

  const cartProductIds = new Set(items.map((i) => i.productId))

  const handleBusinessCategory = (item: BusinessCategory) => {
    if (item.soon) return
    setActiveBusinessCategory(item.id)
    if (item.slug) navigate(`/catalog/${item.slug}`)
  }

  const handleCategoryClick = (cat: (typeof CATEGORIES)[0]) => {
    if (cat.slug) navigate(`/catalog/${cat.slug}`)
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-4 md:py-6 flex gap-4 md:gap-5">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-[210px] shrink-0 gap-3" aria-label="Navegación lateral">
        {/* Sección COMPRAR */}
        <nav className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
          <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Comprar</p>
          <ul role="list">
            {BCATS_COMPRAR.map((item) => {
              const isActive = activeBusinessCategory === item.id && !item.soon
              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleBusinessCategory(item)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-disabled={item.soon}
                    className={[
                      'relative w-full flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-left transition-colors',
                      isActive
                        ? 'bg-brand-primary-light text-brand-primary font-semibold'
                        : item.soon
                          ? 'text-brand-muted cursor-default'
                          : 'text-brand-dark hover:bg-brand-bg',
                    ].join(' ')}
                  >
                    <item.Icon
                      size={16}
                      className={isActive ? 'text-brand-primary' : item.soon ? 'text-gray-300' : 'text-brand-muted'}
                      strokeWidth={1.8}
                    />
                    <span className="flex-1 leading-snug">{item.name}</span>
                    {item.soon && (
                      <span className="absolute top-1 right-2 text-[9px] font-semibold text-brand-primary bg-brand-primary-light px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        Pronto
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Sección SERVICIOS */}
          <div className="border-t border-brand-border mt-1">
            <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Servicios</p>
            <ul role="list">
              {BCATS_SERVICIOS.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleBusinessCategory(item)}
                    aria-disabled={item.soon}
                    className="relative w-full flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-left text-brand-muted cursor-default transition-colors hover:bg-brand-bg"
                  >
                    <item.Icon size={16} className="text-gray-300" strokeWidth={1.8} />
                    <span className="flex-1 leading-snug">{item.name}</span>
                    <span className="absolute top-1 right-2 text-[9px] font-semibold text-brand-primary bg-brand-primary-light px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      Pronto
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Sección COMUNIDAD */}
          <div className="border-t border-brand-border mt-1 mb-1">
            <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-brand-muted uppercase tracking-widest">Comunidad</p>
            <ul role="list">
              {BCATS_COMUNIDAD.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleBusinessCategory(item)}
                    aria-disabled={item.soon}
                    className="relative w-full flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-left text-brand-muted cursor-default transition-colors hover:bg-brand-bg"
                  >
                    <item.Icon size={16} className="text-gray-300" strokeWidth={1.8} />
                    <span className="flex-1 leading-snug">{item.name}</span>
                    <span className="absolute top-1 right-2 text-[9px] font-semibold text-brand-primary bg-brand-primary-light px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      Pronto
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Promo envío gratis */}
        <div className="rounded-2xl overflow-hidden border border-brand-primary-light bg-brand-primary-light shadow-card relative">
          <img
            src={promoEnvioGratis}
            alt="Repartidor de Maui"
            draggable={false}
            className="w-full object-cover object-center select-none"
          />
          <div className="px-4 pb-4 -mt-2">
            <p className="text-[13px] font-bold text-brand-primary leading-tight">Envío gratis</p>
            <p className="text-[11px] text-brand-muted mt-0.5 leading-snug">En compras superiores a</p>
            <p className="text-[22px] font-extrabold text-brand-primary leading-none mt-0.5">$30.000</p>
          </div>
        </div>
      </aside>

      {/* ── Contenido principal ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4 md:gap-5">

        {/* Categorías horizontales móvil */}
        <div className="lg:hidden relative">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="list" aria-label="Categorías">
            {MOBILE_BCATS.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleBusinessCategory(cat)}
                role="listitem"
                className={[
                  'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border',
                  activeBusinessCategory === cat.id
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

        {/* ── Beneficios para ti ───────────────────────────────────────────── */}
        <section aria-label="Beneficios de comprar en MAUI">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-brand-dark">Beneficios para ti</h2>
            <button
              onClick={() => {}}
              className="text-brand-primary text-xs font-semibold hover:underline underline-offset-2 transition-colors inline-flex items-center gap-0.5"
            >
              Ver todos <ChevronRight size={13} />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 md:grid md:grid-cols-4 md:overflow-visible md:pb-0">
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
        </section>

        {/* ── Categorías principales ───────────────────────────────────────── */}
        <section aria-label="Categorías principales">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-brand-dark">Categorías principales</h2>
            <button
              onClick={() => navigate('/catalog')}
              className="text-brand-primary text-xs font-semibold hover:underline underline-offset-2 transition-colors inline-flex items-center gap-0.5"
            >
              Ver todas las categorías <ChevronRight size={13} />
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 md:overflow-visible md:pb-0 md:grid md:grid-cols-9">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat)}
                className="shrink-0 w-[80px] md:w-auto bg-white rounded-xl border border-brand-border p-2.5 flex flex-col items-center gap-2 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-primary-light flex items-center justify-center">
                  <cat.Icon size={20} className="text-brand-primary" strokeWidth={1.6} />
                </div>
                <span className="text-[11px] font-medium text-brand-dark leading-tight text-center line-clamp-2">{cat.name}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Ofertas del día ─────────────────────────────────────────────────── */}
        <section aria-label="Ofertas del día">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-brand-dark">Ofertas del día 🔥</h2>
            <button
              onClick={() => navigate('/catalog/frutas-verduras')}
              className="text-brand-primary text-xs font-semibold hover:underline underline-offset-2 transition-colors inline-flex items-center gap-0.5"
            >
              Ver todas las ofertas <ChevronRight size={13} />
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3">
              <MauiPlusCard />
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3">
              {/* MAUI Plus — siempre primer slot */}
              <MauiPlusCard bannerSrc={bannerAhorraMauiPlus} />

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
            </div>
          )}
        </section>

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

// ── MauiPlusCard ─────────────────────────────────────────────────────────────
function MauiPlusCard({ bannerSrc }: { bannerSrc?: string }) {
  return (
    <div
      aria-label="MAUI Plus"
      className="flex rounded-2xl overflow-hidden shadow-brand-md relative min-h-[200px]"
    >
      {bannerSrc && (
        <img
          src={bannerSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <div
        className={[
          'absolute inset-0',
          bannerSrc
            ? 'bg-gradient-to-b from-brand-primary/80 via-brand-primary/60 to-brand-primary/90'
            : 'bg-gradient-to-b from-brand-primary via-brand-secondary to-brand-primary-dark',
        ].join(' ')}
      />
      <div className="relative z-10 p-4 flex flex-col justify-between w-full">
        <div>
          <p className="text-white/80 text-[11px] font-medium leading-tight">Ahorra más con</p>
          <p className="text-white text-xl font-extrabold leading-tight mt-0.5">MAUI Plus</p>
          <p className="text-white/90 text-[11px] leading-snug mt-2">
            Descuentos exclusivos y envíos gratis siempre
          </p>
        </div>
        <button className="mt-4 py-2 px-3 w-full rounded-xl bg-white/20 border border-white/40 text-white text-xs font-semibold hover:bg-white/30 transition-colors inline-flex items-center justify-center gap-1">
          Conocer más <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
