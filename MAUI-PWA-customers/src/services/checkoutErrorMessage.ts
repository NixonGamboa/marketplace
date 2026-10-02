import { ApiError } from './http/apiError'

const GENERIC_MESSAGE = 'No pudimos procesar tu pedido. Inténtalo de nuevo.'

/**
 * Mensaje para el cliente cuando falla el envío del pedido. El carrito siempre se conserva; en un
 * timeout o corte el pedido pudo haberse creado, y reintentar reutiliza la misma clave de idempotencia.
 */
export function checkoutErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC_MESSAGE
  switch (error.kind) {
    case 'unauthenticated':
      return 'Inicia sesión para hacer tu pedido. Tu carrito sigue guardado.'
    case 'forbidden':
      return 'Tu cuenta no puede hacer este pedido. Tu carrito sigue guardado.'
    case 'conflict':
      return 'No pudimos confirmar este pedido. Revisa Mis pedidos antes de intentarlo de nuevo.'
    case 'rate_limited':
      return error.retryAfterSeconds
        ? `Hiciste muchos intentos. Reintenta en ${error.retryAfterSeconds} segundos.`
        : 'Hiciste muchos intentos. Reintenta en unos minutos.'
    case 'timeout':
    case 'network':
    case 'invalid_response':
      return 'No pudimos confirmar tu pedido por la conexión. Reintenta: no se duplicará. Tu carrito sigue guardado.'
    case 'unavailable':
    case 'server':
      return 'El servicio no está disponible por ahora. Tu carrito sigue guardado; inténtalo en un momento.'
    case 'validation':
    case 'invalid_request':
      return error.message
    default:
      return GENERIC_MESSAGE
  }
}
