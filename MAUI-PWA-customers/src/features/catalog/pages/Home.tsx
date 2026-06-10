import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Leaf, Utensils, Milk, ShoppingBasket, GlassWater, Sparkles, Cookie, Snowflake,
  Truck, ShieldCheck, Award, MessageCircle, ChevronRight, ChevronDown,
  Store, Wrench, PawPrint, Zap, Car, Home as HomeIconLucide, Tag, Star,
  type LucideIcon,
} from 'lucide-react'
import type { BusinessCategory, BusinessCategoryGroup } from '@/types'
import HeroCarousel from '../components/HeroCarousel'
import { heroSlides } from '@/assets/hero'
import { bannerAhorraMauiPlus } from '@/assets/banners'
import { promoEnvioGratis } from '@/assets/promos'
import { useFeaturedProducts, useCategories, useBusinessCategoryGroups } from '@/hooks'
import { useAddToCart, useCart } from '@/hooks'
import ProductCard from '../components/ProductCard'
import { ProductCardSkeleton } from '../components/ProductCardSkeleton'

// ── Registro de íconos (UI-only: resuelve iconName → LucideIcon) ──────────────
const BCAT_ICON_REGISTRY: Record<string, LucideIcon> = {
  Store, Leaf, Utensils, Wrench, Zap, PawPrint,
  Car, Truck, Home: HomeIconLucide, Tag, Star,
  Milk, ShoppingBasket, GlassWater, Sparkles, Cookie, Snowflake,
}

// ── Atajos de navegación móvil (scroll horizontal — lista plana UI-only) ──────
type MobileNavItem = { id: string; name: string; iconName: string; slug: string | null }
const MOBILE_BCATS: MobileNavItem[] = [
  { id: 'mercado',   name: 'Mercado',           iconName: 'Store',          slug: null              },
  { id: 'cat-fv',   name: 'Frutas y Verduras', iconName: 'Leaf',           slug: 'frutas-verduras' },
  { id: 'cat-ca',   name: 'Carnes',            iconName: 'Utensils',       slug: 'carnes'          },
  { id: 'cat-la',   name: 'Lácteos',           iconName: 'Milk',           slug: 'lacteos'         },
  { id: 'cat-ab',   name: 'Despensa',          iconName: 'ShoppingBasket', slug: 'despensa'        },
  { id: 'cat-be',   name: 'Bebidas',           iconName: 'GlassWater',     slug: 'bebidas'         },
  { id: 'cat-as',   name: 'Limpieza',          iconName: 'Sparkles',       slug: 'aseo'            },
  { id: 'cat-sn',   name: 'Snacks',            iconName: 'Cookie',         slug: null              },
  { id: 'cat-co',   name: 'Congelados',        iconName: 'Snowflake',      slug: null              },
]

const BENEFITS: { Icon: LucideIcon; title: string; sub: string }[] = [
  { Icon: Truck,         title: 'Envío rápido',        sub: 'Entrega en 2-4h' },
  { Icon: ShieldCheck,   title: 'Pago contraentrega',   sub: 'Pagas al recibir' },
  { Icon: Award,         title: 'Calidad garantizada',  sub: 'Productos seleccionados' },
  { Icon: MessageCircle, title: 'Atención al cliente',  sub: 'Estamos para ayudarte' },
]

const TRUST = ['Productos 100% frescos', 'Precios justos todos los días', 'Apoyamos lo local']

const PRODUCT_SKELETON_SLOTS = [0, 1, 2, 3]

export default function Home() {
  const navigate = useNavigate()
  const addToCart = useAddToCart()
  const { items } = useCart()
  const [activeBusinessCategory, setActiveBusinessCategory] = useState('mercado')
  const { data: featured, isLoading } = useFeaturedProducts()
  const { data: categories = [] } = useCategories()
  const { data: bCatGroups = [] } = useBusinessCategoryGroups()

  const cartProductIds = useMemo(() => new Set(items.map((i) => i.productId)), [items])

  const handleBusinessCategory = (item: BusinessCategory | MobileNavItem) => {
    if ('comingSoon' in item && item.comingSoon) return
    setActiveBusinessCategory(item.id)
    if (item.slug) navigate(`/catalog/${item.slug}`)
  }

  const handleCategoryClick = (cat: { slug?: string | null }) => {
    if (cat.slug) navigate(`/catalog/${cat.slug}`)
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-4 md:py-6 flex gap-4 md:gap-5">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-[210px] shrink-0 gap-3" aria-label="Navegación lateral">
        <nav className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
          {bCatGroups.map((group, index) => (
            <SidebarSection
              key={group.id}
              group={group}
              activeId={activeBusinessCategory}
              iconRegistry={BCAT_ICON_REGISTRY}
              onSelect={handleBusinessCategory}
              first={index === 0}
              last={index === bCatGroups.length - 1}
            />
          ))}
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
      <div className="flex-1 min-w-0 flex flex-col gap-4 md:gap-5">

        {/* Categorías horizontales móvil — ocultas (reemplazadas por BottomNavBar) */}
        <div className="hidden">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="list" aria-label="Categorías">
            {MOBILE_BCATS.map((cat) => {
              const Icon = BCAT_ICON_REGISTRY[cat.iconName]
              return (
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
                  {Icon && <Icon size={13} strokeWidth={2} />}
                  <span>{cat.name}</span>
                </button>
              )
            })}
          </div>
          <div className="absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-brand-bg to-transparent pointer-events-none" />
        </div>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <HeroCarousel slides={heroSlides} />

        {/* Promo envío gratis — solo móvil (oculta; sidebar desktop tiene la propia) */}
        <div className="hidden">
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
            <span className="text-brand-primary text-xs font-semibold inline-flex items-center gap-0.5 opacity-50 cursor-default">
              Ver todos <ChevronRight size={13} />
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 md:gap-3">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="bg-white rounded-xl border border-brand-border p-2 md:p-3 flex flex-col md:flex-row items-center gap-1.5 md:gap-3 shadow-card text-center md:text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-brand-primary-light flex items-center justify-center shrink-0">
                  <b.Icon size={18} className="text-brand-primary" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs font-semibold text-brand-dark leading-tight">{b.title}</p>
                  <p className="hidden md:block text-[11px] text-brand-muted mt-0.5 leading-tight">{b.sub}</p>
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
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat)}
                className="shrink-0 w-[80px] flex flex-col items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 md:w-auto md:bg-white md:rounded-xl md:border md:border-brand-border md:p-2.5 md:shadow-card md:hover:shadow-card-hover md:hover:-translate-y-0.5 md:transition-all md:duration-200"
              >
                <div className="w-24 h-24 rounded-full bg-brand-primary-light flex items-center justify-center overflow-hidden shadow-[0_4px_14px_rgba(99,102,241,0.25)]">
                  {cat.illustrationUrl ? (
                    <img src={cat.illustrationUrl} alt={cat.name} className="w-full h-full object-cover" draggable={false} />
                  ) : (
                    <span className="text-brand-primary text-lg">·</span>
                  )}
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
              {PRODUCT_SKELETON_SLOTS.map((i) => (
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
                  description={product.description}
                  nutritionalInfo={product.nutritionalInfo}
                  availability={product.availability}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Trust bar ───────────────────────────────────────────────────────── */}
        <div
          className="hidden md:flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 border-t border-brand-border"
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

// ── SidebarSection ────────────────────────────────────────────────────────────
function SidebarSection({
  group,
  activeId,
  iconRegistry,
  onSelect,
  first = false,
  last = false,
}: {
  group: BusinessCategoryGroup
  activeId: string
  iconRegistry: Record<string, LucideIcon>
  onSelect: (item: BusinessCategory) => void
  first?: boolean
  last?: boolean
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className={[!first && 'border-t border-brand-border mt-1', last && 'mb-1'].filter(Boolean).join(' ')}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center justify-between w-full px-4 pt-3 pb-1"
      >
        <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
          {group.label}
        </span>
        <ChevronDown
          size={13}
          className={[
            'text-brand-muted transition-transform duration-200',
            expanded ? '-rotate-180' : 'rotate-0',
          ].join(' ')}
        />
      </button>
      {expanded && (
        <ul role="list">
          {group.items.map((item) => {
            const Icon = iconRegistry[item.iconName]
            const isActive = activeId === item.id && !item.comingSoon
            return (
              <li key={item.id}>
                <button
                  onClick={() => onSelect(item)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-disabled={item.comingSoon}
                  className={[
                    'relative w-full flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium text-left transition-colors',
                    isActive
                      ? 'bg-brand-primary-light text-brand-primary font-semibold'
                      : item.comingSoon
                        ? 'text-brand-muted cursor-default'
                        : 'text-brand-dark hover:bg-brand-bg',
                  ].join(' ')}
                >
                  {Icon && (
                    <Icon
                      size={16}
                      className={isActive ? 'text-brand-primary' : item.comingSoon ? 'text-gray-300' : 'text-brand-muted'}
                      strokeWidth={1.8}
                    />
                  )}
                  <span className="flex-1 leading-snug">{item.name}</span>
                  {item.comingSoon && (
                    <span className="absolute top-1 right-2 text-[9px] font-semibold text-brand-primary bg-brand-primary-light px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      Próximamente
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
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
      {!bannerSrc && (
        <div className="absolute inset-0 bg-gradient-to-b from-brand-primary via-brand-secondary to-brand-primary-dark" />
      )}
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
