/**
 * Genera las versiones WebP de las imágenes comerciales pesadas de `src/assets/`.
 *
 * Los PNG originales se conservan como master (no se borran ni se referencian); la app importa los
 * `.webp` hermanos. Cada entrada fija el ancho máximo con el que la UI las muestra (con margen 2x).
 *
 * Uso: `node scripts/optimize-assets.mjs` desde MAUI-PWA-customers. Requiere `sharp` (dependencia
 * del monorepo raíz, resuelta por node_modules hoisted); no es una dependencia del build de la PWA.
 */
import { createRequire } from 'node:module'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const ASSETS = fileURLToPath(new URL('../src/assets/', import.meta.url))

const CATEGORY_TILE = { maxWidth: 640, quality: 80 }
const HERO = { maxWidth: 1600, quality: 78 }
const PROMO = { maxWidth: 1000, quality: 80 }
const PRODUCT = { maxWidth: 800, quality: 82 }

const SOURCES = {
  'logo/imagotipo.png': { maxWidth: 512, quality: 85 },
  'logo/isotipo.png': { maxWidth: 512, quality: 85 },
  'logo/logotipo.png': { maxWidth: 960, quality: 85 },
  'hero/alianza.png': HERO,
  'hero/hero-parque.png': HERO,
  'hero/hero-supermercado-abarrotes.png': HERO,
  'banners/ahorra-maui-plus.png': PROMO,
  'promos/envio-gratis.png': PROMO,
  'products/lacteos/leche.png': PRODUCT,
  'products/lacteos/queso-campesino.png': PRODUCT,
  ...Object.fromEntries(
    ['bebidas', 'cogelados', 'despensa', 'electro', 'herramientas', 'jugueteria', 'lacteos', 'limpieza', 'snacks']
      .map((name) => [`categories/${name}.png`, CATEGORY_TILE]),
  ),
}

let before = 0
let after = 0
for (const [source, { maxWidth, quality }] of Object.entries(SOURCES)) {
  const input = join(ASSETS, source)
  const output = input.replace(/\.png$/, '.webp')
  await sharp(input)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality, alphaQuality: 90, effort: 6 })
    .toFile(output)
  const [original, optimized] = await Promise.all([stat(input), stat(output)])
  before += original.size
  after += optimized.size
  console.log(`${source.padEnd(42)} ${(original.size / 1024).toFixed(0).padStart(6)} KB → ${(optimized.size / 1024).toFixed(0).padStart(5)} KB`)
}
console.log(`Total ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`)
