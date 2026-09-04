export const formatPrice = (value: number, currency = 'COP'): string => {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `$${value}`
  }
}
