/**
 * @spec §4, §7, CU-1 — Sidebar de navegación filtrada por rol.
 * owner: todos los items.
 * operator: Dashboard, Pedidos, Histórico únicamente.
 * Sin focus-ring morado: el active state usa border + tint + shadow (estándar del proyecto).
 */
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingBag,
  History,
  BookOpen,
  Tag,
  Store,
  Settings,
  ClipboardList,
} from 'lucide-react'
import type { Role } from '@/types/auth'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  roles: Role[]
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',             label: 'Dashboard',    icon: <LayoutDashboard className="w-5 h-5" />,  roles: ['owner', 'operator'] },
  { to: '/pedidos',      label: 'Pedidos',       icon: <ShoppingBag className="w-5 h-5" />,      roles: ['owner', 'operator'] },
  { to: '/historico',    label: 'Histórico',     icon: <History className="w-5 h-5" />,           roles: ['owner', 'operator'] },
  { to: '/catalogo',     label: 'Catálogo',      icon: <BookOpen className="w-5 h-5" />,          roles: ['owner'] },
  { to: '/categorias',   label: 'Categorías',    icon: <Tag className="w-5 h-5" />,               roles: ['owner'] },
  { to: '/tienda',       label: 'Tienda',        icon: <Store className="w-5 h-5" />,             roles: ['owner'] },
  { to: '/configuracion',label: 'Configuración', icon: <Settings className="w-5 h-5" />,          roles: ['owner'] },
  { to: '/auditoria',    label: 'Auditoría',     icon: <ClipboardList className="w-5 h-5" />,     roles: ['owner'] },
]

interface SidebarProps {
  role: Role
}

export function Sidebar({ role }: SidebarProps) {
  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1 p-3">
      {visible.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            [
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
              isActive
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-transparent',
            ].join(' ')
          }
          aria-current={undefined}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
