import { Link } from 'react-router-dom'
import Button from '@/shared/components/ui/Button'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <h1 className="text-7xl font-bold text-brand-primary">404</h1>
      <p className="text-xl text-white/80">Página no encontrada</p>
      <p className="text-sm text-white/50 max-w-xs">
        La página que buscas no existe o fue movida.
      </p>
      <Link to="/">
        <Button variant="primary" size="lg">
          Volver al inicio
        </Button>
      </Link>
    </div>
  )
}
