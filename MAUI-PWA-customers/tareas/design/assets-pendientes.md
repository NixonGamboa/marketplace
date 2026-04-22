# Assets Pendientes de Diseño — MAUI

Paleta de referencia: verde `#2F7D32` · crema `#F8F4EE` · ámbar `#E65100` · texto `#1A1A1A`

---

## Prioridad 1 — Logo (BLOQUEANTE)

El header actual muestra "MAUI" como texto con color de enlace (morado) porque no existe el archivo SVG.

| Archivo destino | Uso | Especificaciones |
|---|---|---|
| `public/logo/maui-logo-dark.svg` | Header (fondo crema) | Logo con texto oscuro `#1A1A1A` o verde `#2F7D32` |
| `public/logo/maui-logo-light.svg` | Footer, banners sobre fondo oscuro | Logo con texto blanco |
| `public/logo/maui-icon.svg` | Solo ícono sin texto | Para favicon y placeholder PWA |

---

## Prioridad 2 — Íconos de Categorías / Pasillos (BLOQUEANTE para PasillosGrid)

Actualmente se muestra un ícono genérico de cuadrícula como fallback.

**Especificaciones**: SVG · viewBox 48×48px · estilo flat · max 2 colores de la paleta · sin strokes >2px

| Archivo destino | Categoría |
|---|---|
| `public/assets/categories/cat-abarrotes.svg` | Abarrotes |
| `public/assets/categories/cat-lacteos.svg` | Lácteos |
| `public/assets/categories/cat-aseo.svg` | Aseo / Limpieza |
| `public/assets/categories/cat-panaderia.svg` | Panadería |
| `public/assets/categories/cat-bebidas.svg` | Bebidas |
| `public/assets/categories/cat-carnes.svg` | Carnes |
| `public/assets/categories/cat-frutas-verduras.svg` | Frutas y Verduras |

---

## Prioridad 3 — Fotos de Productos

Actualmente los `<ProductCard>` muestran el área de imagen vacía (alt text visible).

**Especificaciones**:
- Formato: WebP principal + JPEG fallback
- Fondo: blanco puro `#FFFFFF`
- Ratio: 1:1 (cuadrado)
- Tamaños: 400×400px (≤30 KB) y 800×800px (≤60 KB)
- Nomenclatura: `{productId}-400w.webp` y `{productId}-800w.webp`
- Destino: `public/assets/products/`

Productos actuales en mock (IDs):

| ID | Nombre |
|---|---|
| `prod-001` | Leche Entera Colanta |
| `prod-002` | Queso Campesino |
| `prod-003` | Arroz Diana 500g |
| `prod-004` | Aceite Girasol 1L |
| `prod-005` | Pan Tajado Bimbo |
| `prod-006` | Pollo Entero |

---

## Prioridad 4 — Íconos PWA (fondo verde)

Reemplazar los íconos actuales que tienen fondo morado.

**Especificaciones**: PNG · fondo `#2F7D32` · logo/ícono blanco centrado · sin transparencia en maskable

| Archivo | Tamaño |
|---|---|
| `public/icons/icon-192.png` | 192×192 px |
| `public/icons/icon-512.png` | 512×512 px |
| `public/icons/maskable-512.png` | 512×512 px · logo en zona segura 80% del centro |
| `public/icons/apple-touch-icon.png` | 180×180 px · sin transparencia |

---

## Prioridad 5 — Ilustraciones de Estados Vacíos

**Especificaciones**: SVG · ≤8 KB · estilo flat · paleta cálida (crema, verde, ámbar)

| Archivo | Dónde se usa | Estado actual |
|---|---|---|
| `public/assets/empty-cart.svg` | `CartPage` cuando el carrito está vacío | Muestra ícono lucide genérico |
| `public/assets/order-success.svg` | `OrderConfirmationPage` tras confirmar pedido | Vista no implementada aún (FEAT-009) |
| `public/assets/search-empty.svg` | `SearchPage` cuando no hay resultados | Vista existe, usa placeholder |
| `public/assets/store-closed.svg` | `StoreStatusBanner` cuando la tienda está cerrada | Banner rojo sin ilustración |

---

## Notas

- Las ilustraciones de estados vacíos **no bloquean** el MVP — los fallbacks con íconos lucide son funcionales.
- Los íconos de categorías **sí bloquean** la identidad visual del PasillosGrid (hoy se ve genérico).
- El logo es lo más visible: afecta todas las páginas via el Header.
- Una vez entregados los logos SVG, el componente `Header.tsx` ya está preparado para cargarlos (`<img src="/logo/maui-logo-dark.svg" alt="MAUI" />`).
