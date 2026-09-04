import { Link } from 'react-router-dom'
import { Sparkles, ArrowLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ComingSoonPageProps {
  title: string
  description?: string
  icon?: LucideIcon
}

export default function ComingSoonPage({
  title,
  description = 'Estamos trabajando en esta sección. Muy pronto va a estar disponible.',
  icon: Icon = Sparkles,
}: ComingSoonPageProps) {
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
        <h1 className="text-base font-semibold text-brand-dark">{title}</h1>
      </header>

      <div className="flex flex-col items-center justify-center px-6 py-20 gap-4 text-center max-w-md mx-auto">
        <div className="w-20 h-20 rounded-full bg-brand-primary/10 flex items-center justify-center">
          <Icon className="text-brand-primary" size={36} aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold text-brand-dark">Próximamente</h2>
        <p className="text-brand-muted text-sm leading-relaxed">{description}</p>
        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-brand-sm hover:bg-brand-primary-dark transition-colors"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  )
}
