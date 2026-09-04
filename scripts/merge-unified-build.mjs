/**
 * Merge unified deploy build.
 *
 * Toma el build del admin (`maui-admin-front/dist-unified/`) y lo copia dentro
 * del dist de la PWA (`MAUI-PWA-customers/dist/admin/`), produciendo un único
 * artefacto estático deployable donde:
 *
 *   /            → PWA (customers)
 *   /admin/      → Panel del owner/operator
 *
 * Ambos comparten origin → mismo localStorage → el flujo end-to-end funciona:
 * el pedido creado en la PWA aparece en el admin en tiempo real (evento storage).
 *
 * Uso: `npm run build:unified` desde MAUI-PWA-customers.
 */

import { cp, readdir, rm, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const PWA_DIST   = join(ROOT, 'MAUI-PWA-customers', 'dist')
const ADMIN_DIST = join(ROOT, 'maui-admin-front', 'dist-unified')
const OUT_ADMIN  = join(PWA_DIST, 'admin')

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

async function humanSize(p) {
  const s = await stat(p)
  return `${(s.size / 1024).toFixed(1)} KB`
}

async function main() {
  if (!(await exists(PWA_DIST))) {
    console.error(`✗ PWA dist no encontrado en ${PWA_DIST}. Corre 'vite build --mode demo' en MAUI-PWA-customers primero.`)
    process.exit(1)
  }
  if (!(await exists(ADMIN_DIST))) {
    console.error(`✗ Admin dist no encontrado en ${ADMIN_DIST}. Corre 'npm run build:unified' en maui-admin-front primero.`)
    process.exit(1)
  }

  // Limpia destino
  if (await exists(OUT_ADMIN)) {
    await rm(OUT_ADMIN, { recursive: true, force: true })
  }

  // Copia recursiva (Node >=16.7)
  await cp(ADMIN_DIST, OUT_ADMIN, { recursive: true })

  // Reporte
  const files = await readdir(OUT_ADMIN, { recursive: true })
  console.log(`✓ Admin injertado en ${OUT_ADMIN}`)
  console.log(`  ${files.length} archivos copiados`)

  const indexHtml = join(OUT_ADMIN, 'index.html')
  if (await exists(indexHtml)) {
    console.log(`  Entry admin: /admin/index.html (${await humanSize(indexHtml)})`)
  }
  const pwaIndex = join(PWA_DIST, 'index.html')
  if (await exists(pwaIndex)) {
    console.log(`  Entry PWA:   /index.html (${await humanSize(pwaIndex)})`)
  }
  console.log('')
  console.log('Deploy estático listo en:', PWA_DIST)
  console.log('  Servir con: cd MAUI-PWA-customers && npm run preview')
  console.log('  O deploy a S3/Vercel/Netlify apuntando a MAUI-PWA-customers/dist/')
}

main().catch((err) => {
  console.error('✗ merge falló:', err.message)
  process.exit(1)
})
