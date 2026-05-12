import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center px-4 bg-red-50">
            <p className="text-red-700 text-sm font-medium">Error: {this.state.error?.message}</p>
            <pre className="text-xs text-red-600 max-w-md overflow-auto text-left whitespace-pre-wrap">{this.state.error?.stack}</pre>
            <p className="text-brand-muted text-xs">Ver consola del navegador (F12) para más detalles.</p>
          </div>
        )
      )
    }
    return this.props.children
  }
}
