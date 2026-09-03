# Catálogo compartido MAUI (Leche y Miel)

Fuente autoritativa del catálogo real del aliado. Consumido por:

- **PWA** (`MAUI-PWA-customers`): `src/features/catalog/mockData.ts` importa
  `sharedProducts` y `sharedCategories` desde aquí. La PWA decora `imageUrl` con
  imports locales de `src/assets/products/*` para servirlos con el hash de Vite.
- **Admin** (`maui-admin-front`): `src/services/seed/catalogSeed.ts` importa el
  mismo baseline. El owner puede editar en `/catalogo` y su copia diverge en
  `localStorage['maui-admin-catalog']`. El botón "Reiniciar demo" en
  `/configuracion` vuelve al baseline.

## Reglas de edición

1. Los `id` son el contrato. Un pedido de la PWA viaja con `item.id` que el
   admin resuelve contra este baseline vía `catalogRepo.getProduct(id)`. **No
   renombrar ids** sin coordinar migración de pedidos en curso.
2. Los `categoryId` deben existir en `categories.ts`.
3. Los precios se declaran en COP sin decimales. Para productos por peso variable
   (`is_variable_weight: true`), `price` es **precio por kilogramo** (ADR-006).
4. Las rutas de `imageUrl` que empiezan por `/product-images/…` sólo funcionan
   cuando el deploy sirve ambos apps bajo el mismo dominio (Paso 5 del plan).
   Placeholders (`https://placehold.co/…`) sirven mientras.

## Drift-check

`scripts/check-catalog-drift.sh` verifica que ambos apps ven la misma cantidad
de productos y categorías del baseline. No compara byte-a-byte (los apps
enriquecen datos localmente).
