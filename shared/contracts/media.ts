/** T-09: transporte JSON bajo el límite de 4.5 MB de Vercel Functions. */
export const PRODUCT_IMAGE_LIMITS = {
  inputBytes: 3 * 1024 * 1024,
  jsonBytes: 4 * 1024 * 1024 + 256,
  outputBytes: 1024 * 1024,
  maxPixels: 20_000_000,
  maxInputDimension: 10_000,
  maxOutputDimension: 1600,
} as const

export const PRODUCT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
