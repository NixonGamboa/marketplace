import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  Heart,
  LogOut,
  MapPin,
  MessageCircle,
  Pencil,
  ShoppingBag,
  Sparkles,
  X,
  Check,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import Icon from '@/shared/components/ui/Icon'
import { WHATSAPP_LINK } from '@/config/app'

/** Devuelve hasta 2 iniciales en mayúscula a partir del nombre. */
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'M'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** +573001234567 → +57 300 123 4567 */
function formatPhonePretty(phone: string) {
  const digits = phone.replace(/[^\d]/g, '')
  const local = digits.startsWith('57') ? digits.slice(2) : digits
  if (local.length !== 10) return phone
  return `+57 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
}

interface MenuRow {
  icon: typeof ShoppingBag
  label: string
  to?: string
  href?: string
  helper?: string
  onClick?: () => void
  variant?: 'default' | 'danger'
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, updateProfile, logout } = useAuthStore()

  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(user?.name ?? '')
  const [addressDraft, setAddressDraft] = useState(user?.address ?? '')

  useEffect(() => {
    if (!isAuthenticated) navigate('/auth', { replace: true, state: { from: '/perfil' } })
  }, [isAuthenticated, navigate])

  useEffect(() => {
    if (!editing && user) {
      setNameDraft(user.name)
      setAddressDraft(user.address ?? '')
    }
  }, [editing, user])

  if (!user) return null

  const handleSave = () => {
    const cleanName = nameDraft.trim() || user.name
    updateProfile({ name: cleanName, address: addressDraft.trim() || undefined })
    setEditing(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  const menu: MenuRow[] = [
    { icon: ShoppingBag, label: 'Mis pedidos', helper: 'Historial y seguimiento', to: '/pedidos' },
    {
      icon: MapPin,
      label: 'Dirección de entrega',
      helper: user.address || 'Sin dirección guardada',
      onClick: () => setEditing(true),
    },
    { icon: Heart, label: 'Favoritos', helper: 'Productos que te gustaron', to: '/favoritos' },
    {
      icon: MessageCircle,
      label: 'Ayuda por WhatsApp',
      helper: 'Escríbenos si necesitas apoyo',
      href: WHATSAPP_LINK,
    },
  ]

  return (
    <div className="bg-brand-bg min-h-full">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-10 flex flex-col gap-5">
        {/* Hero — avatar + identidad */}
        <section
          aria-label="Perfil"
          className="bg-white rounded-3xl border border-brand-border shadow-card p-5 md:p-6"
        >
          <div className="flex items-center gap-4">
            <div
              aria-hidden="true"
              className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center text-2xl md:text-3xl font-bold select-none"
            >
              {getInitials(user.name)}
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={40}
                  autoFocus
                  className="w-full text-lg md:text-xl font-bold text-brand-dark bg-brand-bg rounded-xl px-3 py-2 border border-brand-border focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                  placeholder="Tu nombre"
                  aria-label="Editar nombre"
                />
              ) : (
                <h1 className="text-lg md:text-xl font-bold text-brand-dark truncate">
                  {user.name}
                </h1>
              )}
              <div className="flex items-center gap-1.5 mt-1 text-brand-muted text-sm">
                <Icon name="whatsapp" size="sm" className="text-brand-whatsapp" decorative />
                <span className="tabular-nums truncate">{formatPhonePretty(user.phone)}</span>
              </div>
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                aria-label="Editar perfil"
                className="shrink-0 w-10 h-10 rounded-full text-brand-muted hover:text-brand-primary hover:bg-brand-primary/5 flex items-center justify-center transition-colors"
              >
                <Pencil size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {editing && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="address" className="text-[13px] font-medium text-brand-dark/90">
                  Dirección de entrega
                </label>
                <input
                  id="address"
                  value={addressDraft}
                  onChange={(e) => setAddressDraft(e.target.value)}
                  maxLength={120}
                  placeholder="Ej: Calle 5 #4-32, Dolores, Tolima"
                  className="w-full rounded-xl border border-brand-border bg-white px-4 py-2.5 text-sm text-brand-dark placeholder:text-brand-muted/70 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 h-11 rounded-xl border border-brand-border text-sm font-semibold text-brand-dark hover:bg-brand-bg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <X size={16} aria-hidden="true" />
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 h-11 rounded-xl bg-brand-primary hover:bg-brand-primary-dark text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Check size={16} aria-hidden="true" />
                  Guardar
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Menú de acciones */}
        <nav aria-label="Opciones de cuenta" className="bg-white rounded-3xl border border-brand-border shadow-card overflow-hidden">
          <ul className="divide-y divide-brand-border">
            {menu.map((row) => (
              <li key={row.label}>
                <MenuRowItem row={row} />
              </li>
            ))}
          </ul>
        </nav>

        {/* Cerrar sesión */}
        <button
          onClick={handleLogout}
          className="w-full bg-white rounded-2xl border border-brand-border shadow-card px-5 py-4 flex items-center justify-center gap-2 text-brand-error font-semibold text-sm hover:bg-red-50 transition-colors"
        >
          <LogOut size={18} aria-hidden="true" />
          Cerrar sesión
        </button>

        {/* Tagline */}
        <div className="flex items-center justify-center gap-1.5 text-brand-muted text-xs pt-2 pb-4">
          <Sparkles size={12} aria-hidden="true" />
          <span>MAUI — soluciones locales a un mensaje</span>
        </div>
      </div>
    </div>
  )
}

function MenuRowItem({ row }: { row: MenuRow }) {
  const Icon = row.icon
  const danger = row.variant === 'danger'

  const content = (
    <div
      className={[
        'flex items-center gap-4 px-5 py-4 transition-colors',
        danger ? 'hover:bg-red-50' : 'hover:bg-brand-bg',
      ].join(' ')}
    >
      <div
        className={[
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
          danger ? 'bg-red-50 text-brand-error' : 'bg-brand-primary/10 text-brand-primary',
        ].join(' ')}
        aria-hidden="true"
      >
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={['text-sm font-semibold', danger ? 'text-brand-error' : 'text-brand-dark'].join(' ')}>
          {row.label}
        </div>
        {row.helper && (
          <div className="text-xs text-brand-muted mt-0.5 truncate">{row.helper}</div>
        )}
      </div>
      <ChevronRight size={18} className="text-brand-muted shrink-0" aria-hidden="true" />
    </div>
  )

  if (row.to) return <Link to={row.to} className="block no-underline">{content}</Link>
  if (row.href)
    return (
      <a href={row.href} target="_blank" rel="noopener noreferrer" className="block no-underline">
        {content}
      </a>
    )
  return (
    <button onClick={row.onClick} className="w-full text-left">
      {content}
    </button>
  )
}
