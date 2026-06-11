# Functional Specification — demo-maui-pwa
<!-- Tech SDD Kit | Language: es | Generated: 2026-06-02 -->

---

## Problem Statement

La PWA MAUI Customers tiene ~55% del frontend construido pero el flujo de valor completo no funciona de punta a punta: no existe backend, el catálogo usa datos ficticios y rutas críticas como `/catalog/:categoryId`, `/checkout` y `/pedidos/:orderId` no están implementadas. Esto hace imposible validar si el producto resuelve el problema real antes de invertir 4–6 semanas en backend. Las fricciones de UX son 10x más baratas de corregir en la capa frontend que después de construir la infraestructura.

---

## Objectives

1. Completar todos los flujos del usuario de punta a punta con mocks que respetan el contrato de la API real
2. Reemplazar el catálogo ficticio con datos reales de Leche y Miel (fotos, precios, nombres verificados)
3. Desplegar en una URL pública instalable como PWA
4. Garantizar que el swap mock → backend real sea un cambio de import, sin tocar componentes
5. Establecer una taxonomía clara que separe `BusinessCategory` (verticales de plataforma MAUI: Mercado, Restaurantes, Servicios, Comunidad) de `Category` (agrupaciones de producto dentro del aliado), preparada para multi-aliado en producción

---

## Scope

> Esta feature cubre **dos aplicaciones** en el mismo workspace: `MAUI-PWA-customers` (PWA cliente) y `maui-admin-front` (panel admin demo). La capa `tech/` en la raíz del workspace unifica ambas.

### In Scope

**App: MAUI-PWA-customers (PWA cliente)**

| Incluido |
|----------|
| Home rediseñada con secciones: `HeroCarousel` · "Beneficios para ti" · "Categorías principales" (PNGs circulares) · `MauiPlusCard` · "Ofertas del día" |
| Sidebar desktop con `BusinessCategoryGroup` colapsable (`SidebarSection` con chevron animado) |
| Header responsive de una sola fila (móvil y desktop) con buscador inline |
| `BottomNavBar` PWA-nativa (móvil/tablet `< lg`): Inicio · Ofertas · Carrito (FAB) · Mis pedidos · Favoritos |
| Modelo de datos taxonómico: `BusinessCategoryGroup` → `BusinessCategory` (sidebar) separado de `Category` (catálogo de producto) |
| `CatalogLandingPage` (`/catalog`) — grid de todos los pasillos; destino del CTA "Comprar en Maui" del HeroCarousel y "Ver todas las categorías" en Home |
| `SearchPage` (`/search?q=...`) — búsqueda en tiempo real sobre `mockProducts` (normaliza acentos, busca en `name`/`name_display`/`name_legal`) |
| `ComingSoonPage` reutilizable — renderiza `/ofertas` y `/favoritos` con CTA "Volver al inicio" |
| `CatalogPage` (`/catalog/:categoryId`) — accesible desde "Categorías principales" en Home y desde Sidebar |
| `ProductDetailSheet` — bottom sheet 90dvh con imagen 4:3, descripción, info nutricional, chip de disponibilidad y selector de cantidad con precio total dinámico |
| `CheckoutPage` con 4 steps (resumen → modalidad → sustitución → confirmación) |
| Pantalla de confirmación + navegación `router.replace('/pedidos/:orderId')` |
| `OrderDetailPage` con `OrderTimeline` de 5 estados |
| `mockOrderService` — implementa `OrderService` con delays 800–1200ms |
| `mockData.ts` actualizado con ~15 productos reales de Leche y Miel |
| `authStore` actualizado con `DEMO_USER` pre-autenticado |
| `CartPage` con CTA corregido a "Pedir mi Mercado" |
| `config/app.ts` con número real de WhatsApp de Leche y Miel |
| `services/index.ts` con switch `VITE_DEMO_MODE` |
| Deploy PWA en URL pública instalable |

**App: maui-admin-front (panel admin demo — construido desde cero)**

| Incluido |
|----------|
| Lista de pedidos leídos desde `localStorage` (`maui-orders`) |
| Detalle de pedido con items, total estimado y estado actual |
| Botones de transición de estado: Recibido → Confirmado → Preparando → Listo → Entregado |
| Link WhatsApp prellenado por estado (diferente mensaje por transición) |
| Simulador de progreso de estado automático cada 20s (modo "demo en vivo") |

### Out of Scope

| Excluido | Razón |
|----------|-------|
| Backend real (AWS SAM + Lambda + DynamoDB) | Sprint 1 — posterior a validación |
| Magic Link / autenticación real por WhatsApp | Demo usa `DEMO_USER` pre-autenticado |
| Panel admin en producción (multi-dispositivo) | El admin demo usa localStorage, no escala |
| Sesiones de validación con usuarios | Fase 2 (ver RFC §9) |
| Go/No-Go explícito | Fase 2 |

---

## User Stories

### US-1 — Navegar el catálogo por pasillos

**Como** usuario de Dolores que abre la app,
**quiero** ver los productos de Leche y Miel organizados por pasillos y acceder al detalle de cada uno,
**para** encontrar lo que necesito sin instrucciones adicionales.

**Acceptance Criteria**:
- AC-1.1: La Home muestra la sección "Categorías principales" con tarjetas circulares (PNG por categoría) que navegan a `/catalog/:categoryId`. También está accesible desde el Sidebar desktop bajo la `BusinessCategory` "Mercado"
- AC-1.2: Al tocar un pasillo, se navega a `/catalog/:categoryId` con el grid de productos de esa categoría
- AC-1.3: Cada card muestra foto WebP, nombre, precio, unidad y badge si aplica (badge `"Local"` se renderiza en verde `bg-emerald-600`; otros badges en `bg-brand-primary`)
- AC-1.4: La card incluye un FAB `+` circular en la esquina inferior derecha; al tocarlo se agrega al carrito. Cuando ya hay unidades, el FAB se reemplaza por `QuantityStepper` (+/−) inline. Para productos `is_variable_weight`, el FAB abre `VariableWeightSheet`; cuando hay kilos en carrito muestra un pill "{X} kg [+]"
- AC-1.5b: Tocar la imagen o el nombre del producto abre `ProductDetailSheet` — bottom sheet a 90dvh con imagen 4:3, descripción, información nutricional (calorías/proteínas/grasas/carbohidratos/fibra si aplica), chip de disponibilidad y selector de cantidad en el footer. El botón principal muestra el precio total dinámico (`qty × precio`). Decrementar a 0 convierte el CTA en "Eliminar del carrito"
- AC-1.5: El catálogo usa skeleton loaders mientras carga; staleTime de React Query: 5 min
- AC-1.6: El catálogo es visible sin conexión (Service Worker CacheFirst para assets)

---

### US-2 — Agregar productos al carrito

**Como** usuario navegando el catálogo,
**quiero** agregar productos y ver el total actualizado en tiempo real,
**para** armar mi pedido antes de ir al checkout.

**Acceptance Criteria**:
- AC-2.1: Al tocar el FAB `+` circular en la card (cuando `quantity === 0`), el producto se agrega al `cartStore`; el FAB se reemplaza por `QuantityStepper`. La `FloatingCartBar` aparece con el total actualizado
- AC-2.2: La `FloatingCartBar` muestra el total actualizado en tiempo real
- AC-2.3: El carrito persiste en `localStorage` (key: `maui-cart`); sobrevive cierres de app y recargas
- AC-2.4: El carrito se recupera al volver a abrir la app después de un cierre accidental
- AC-2.5: Los items del carrito incluyen `price_at_moment` (snapshot de precio al momento de agregar)
- AC-2.6: `QuantityStepper` permite ajustar la cantidad directamente desde la card; soporta long-press (retardo 1 s, luego repite cada 300 ms)
- AC-2.7: Decrementar a 0 unidades elimina el ítem del carrito (`removeItem`)
- AC-2.8: Productos `is_variable_weight: true` abren `VariableWeightSheet` al tocar el FAB. El selector permite elegir entre 0.25 y 5 kg (paso 0.25) con precio estimado en COP en tiempo real
- AC-2.9: Los kilos seleccionados se persisten en `CartItem.kilos`. Desde `CartItemRow` aparece un botón editable "{X} kg [lápiz]" que reabre el sheet con el peso precargado
- AC-2.10: El total del carrito y del checkout calcula `kilos × precio` para ítems de peso variable; `qty × precio` para el resto

---

### US-3 — Producto agotado

**Como** usuario del catálogo,
**quiero** identificar claramente qué productos no están disponibles,
**para** no perder tiempo intentando agregar algo que no hay.

**Acceptance Criteria**:
- AC-3.1: Los productos con `inStock: false` muestran el badge "Agotado"
- AC-3.2: El botón `+` está oculto o deshabilitado en productos agotados
- AC-3.3: No es posible agregar un producto agotado al carrito desde ninguna UI

---

### US-4 — Completar el checkout

**Como** usuario con productos en el carrito,
**quiero** confirmar mi pedido eligiendo modalidad de entrega y preferencia de sustitución,
**para** finalizar la compra con confianza.

**Acceptance Criteria**:
- AC-4.1: La ruta `/checkout` existe y es accesible desde la `FloatingCartBar` o `CartPage`
- AC-4.2: El CTA principal es siempre "Pedir mi Mercado" — la palabra "Pagar" está prohibida
- AC-4.3: El aviso de Ley 1581 es visible antes del CTA de confirmación
- AC-4.4: El step de modalidad ofrece: pickup (3 bandas de hora) o domicilio (dirección + geolocalización)
- AC-4.5: El step de sustitución tiene 3 opciones radio (`call_me` | `similar` | `remove`); bloquea el CTA hasta que se elija una
- AC-4.6: El botón "Pedir mi Mercado" se deshabilita mientras `isSubmitting === true` (evita doble submit)
- AC-4.7: Al tocar "Pedir mi Mercado", se llama a `mockOrderService.submit()` con delay 1200ms (simula 3G)
- AC-4.8: El carrito se destruye **solo** al recibir respuesta exitosa del mock (simula 201)
- AC-4.9: Tras confirmación exitosa, se navega con `router.replace('/pedidos/:orderId')` (nunca `push`)

---

### US-5 — Ver confirmación del pedido

**Como** usuario que acaba de confirmar un pedido,
**quiero** ver el número de orden y la instrucción de pago en efectivo,
**para** saber qué esperar a continuación.

**Acceptance Criteria**:
- AC-5.1: La pantalla de confirmación muestra el `orderId` (formato: `MAUI-{timestamp}`)
- AC-5.2: Aparece el texto "Pagas en efectivo cuando llegue tu pedido" de forma prominente
- AC-5.3: Presionar Atrás desde la confirmación lleva al Home, no al checkout ya enviado
- AC-5.4: Recargar la pantalla de confirmación mantiene visible el número de orden

---

### US-6 — Monitorear el estado del pedido

**Como** usuario con un pedido activo,
**quiero** ver en qué estado está mi pedido y contactar a la tienda si lo necesito,
**para** tener tranquilidad sobre la entrega.

**Acceptance Criteria**:
- AC-6.1: La ruta `/pedidos/:orderId` existe y muestra `OrderDetailPage`
- AC-6.2: `OrderTimeline` muestra los 5 estados con animación en la transición activa: `received` → `confirmed` → `preparing` → `ready` → `delivered`
- AC-6.3: El botón de WhatsApp está prellenado con el mensaje correspondiente al estado actual
- AC-6.4: El polling de estado usa `mockOrderService.getById()` con delay 800ms

---

### US-7 — Empleado procesa pedidos en el panel admin

**Como** empleado de Leche y Miel,
**quiero** ver los pedidos entrantes, avanzar su estado y notificar al cliente por WhatsApp,
**para** operar la tienda online sin entrenamiento extenso.

**Acceptance Criteria**:
- AC-7.1: El panel admin demo es accesible como ruta separada o aplicación separada
- AC-7.2: Lista todos los pedidos guardados en `localStorage` por `mockOrderService`
- AC-7.3: Cada pedido muestra: número de orden, nombre del cliente, items, total estimado y estado actual
- AC-7.4: El empleado puede avanzar el estado con botones: "Confirmar" → "Preparando" → "Listo" → "Entregado"
- AC-7.5: Cada transición de estado muestra un link de WhatsApp prellenado con el mensaje apropiado para ese estado
- AC-7.6: Los cambios de estado se reflejan en la timeline del cliente (`localStorage` compartido)

---

### US-8 — Simulador de progreso para demos en vivo

**Como** facilitador de la sesión de validación,
**quiero** avanzar automáticamente el estado del pedido cada 20 segundos,
**para** demostrar el flujo completo sin intervención manual del empleado.

**Acceptance Criteria**:
- AC-8.1: Existe un botón o modo "Demo en vivo" que activa el simulador de progreso
- AC-8.2: El simulador avanza el estado automáticamente cada 20 segundos
- AC-8.3: El simulador se puede detener manualmente

---

### US-9 — Navegación PWA-nativa en móvil

**Como** usuario móvil de la PWA instalada,
**quiero** una barra inferior con acceso rápido a Inicio, Ofertas, Carrito, Mis pedidos y Favoritos,
**para** moverme entre secciones sin abrir un menú.

**Acceptance Criteria**:
- AC-9.1: `BottomNavBar` visible en breakpoints `< lg`, oculta en desktop
- AC-9.2: Slot Carrito es FAB elevado con badge cuando `cartCount > 0`; plano cuando el carrito está vacío
- AC-9.3: El Footer se oculta en móvil (`lg:hidden`) para no competir con la BottomNav
- AC-9.4: Padding inferior dinámico usa `calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))` para respetar el safe area de la PWA instalada
- AC-9.5: El Header es de una sola fila (`h-14 md:h-16`) tanto en móvil como en desktop

---

### US-10 — Sidebar de verticales de plataforma (desktop)

**Como** usuario desktop,
**quiero** ver las verticales de MAUI agrupadas (Comprar / Servicios / Comunidad) con secciones colapsables,
**para** descubrir el alcance de la plataforma más allá del supermercado.

**Acceptance Criteria**:
- AC-10.1: Cada `BusinessCategoryGroup` se renderiza como `SidebarSection` colapsable con chevron animado (`-rotate-180` cuando expanded)
- AC-10.2: `BusinessCategory` con `comingSoon: true` muestra badge "Próximamente" y no navega (`aria-disabled`)
- AC-10.3: El item activo destaca con `bg-brand-primary-light text-brand-primary font-semibold`
- AC-10.4: El sidebar es visible sólo en `lg` y superior

---

## User Experience

### Flujo principal del cliente

```
Home
  └─▶ Pasillo (CatalogPage /catalog/:categoryId)
        └─▶ ProductDetailSheet (bottom sheet 90dvh — imagen 4:3, detalle, selector cantidad)
              └─▶ CartPage / FloatingCartBar (CTA: "Ver mi Canasta")
                    └─▶ CheckoutPage (/checkout)
                          ├─ Step 1: Resumen del carrito
                          ├─ Step 2: DeliverySelector (pickup / domicilio)
                          ├─ Step 3: SubstitutionSelector (call_me / similar / remove)
                          └─ Step 4: CTA "Pedir mi Mercado"
                                └─▶ Confirmación (router.replace → /pedidos/:orderId)
                                      └─▶ OrderDetailPage — Timeline de 5 estados
```

### Flujo del empleado (admin demo)

```
Panel Admin
  └─▶ Lista de pedidos (localStorage)
        └─▶ Detalle del pedido
              └─▶ Botón de transición de estado
                    └─▶ Link WhatsApp prellenado por estado
```

### Principios de UX del demo

- Todos los CTAs primarios en la mitad inferior de la pantalla (zona del pulgar)
- Contraste mínimo 7:1 (uso bajo sol directo en Dolores)
- Carga <4s en 3G (Samsung A13)
- Copy en lenguaje local — nunca "Pagar", siempre "Pedir mi Mercado"
- Pago en efectivo explícito antes de cualquier CTA de confirmación

---

## Functional Constraints

| Restricción | Tipo |
|-------------|------|
| `VITE_DEMO_MODE=true` activa `mockOrderService`; `false` activa `realOrderService` (swap en `services/index.ts`) | Técnica |
| Sin Magic Link real — el demo usa `DEMO_USER` pre-autenticado en `authStore` | Técnica |
| Imágenes del catálogo: WebP, 400×400px, <30KB | Técnica |
| `router.replace()` en pantalla de confirmación — nunca `router.push()` | Técnica |
| El carrito se destruye solo al recibir respuesta exitosa del mock | Técnica / UX |
| CTA del checkout siempre "Pedir mi Mercado" — prohibida la palabra "Pagar" | Negocio |
| Aviso Ley 1581 visible antes del CTA en el checkout | Legal |
| Catálogo con pasillos reales de Leche y Miel (confirmados con el aliado) | Negocio |
| Peso variable implementado — `VariableWeightSheet` selector 0.25–5 kg (paso 0.25). `CartItem.kilos` persiste la selección. Productos con `is_variable_weight: true` muestran kg en el carrito y en el checkout | Negocio |
| Dark mode disponible vía `ThemeToggle` en el Header — preferencia persistida en `localStorage` (`maui-theme`). La clase `.dark` se sincroniza en `document.documentElement` | UX |
| Envío gratis a partir de $30.000 de subtotal; costo de envío estándar $3.000. Calculado por `calculateShipping()` desde `features/checkout/shipping.ts` | Negocio |
| Taxonomía: `BusinessCategory` = vertical de plataforma (sidebar); `Category` = pasillo de producto (catálogo). Nunca mezclar | Negocio |
| Header de una sola fila tanto móvil como desktop (`h-14 md:h-16`) | UX |
| Imágenes de "Categorías principales": PNG circular 96×96 con `shadow-[0_4px_14px_rgba(99,102,241,0.25)]` brand | Diseño |
| BottomNavBar visible `< lg`; Footer oculto en móvil para no competir | UX |

---

## Quality Attributes

| ID | Atributo | Escenario |
|----|----------|-----------|
| QA-1 | Rendimiento | Carga inicial <4s en 3G (Samsung A13) |
| QA-2 | Accesibilidad | Contraste mínimo 7:1 (uso bajo sol directo) |
| QA-3 | Usabilidad | Todos los CTAs primarios en la mitad inferior de la pantalla |
| QA-4 | Resiliencia | Carrito sobrevive cierre accidental de la app |
| QA-5 | Resiliencia | No doble submit (`isSubmitting` guard) |
| QA-6 | Offline | Home y catálogo visibles desde cache sin conexión |
| QA-7 | Confianza | "Pagas en efectivo cuando llegue tu pedido" visible antes de confirmar |
| QA-8 | Legal | Aviso Ley 1581 visible antes del CTA en el checkout |
| QA-9 | PWA-nativa | BottomNav respeta `env(safe-area-inset-bottom)`; sin scroll horizontal en móvil; FAB carrito accesible con el pulgar |

---

## Dependencies (capabilities)

| Capacidad | Implementación en el demo |
|-----------|--------------------------|
| Persistencia del carrito | `localStorage` via Zustand persist (key: `maui-cart`) |
| Simulación de pedidos (POST/GET) | `mockOrderService` con delays 800–1200ms |
| Comunicación PWA ↔ Admin demo | `localStorage` compartido (clave: `maui-orders`) |
| Datos del catálogo | `mockData.ts` con productos reales de Leche y Miel |
| Deep links de comunicación | WhatsApp `wa.me` prellenado (sin API) |
| Geolocalización | Browser Geolocation API (en modalidad domicilio) |
| Carga offline | Service Worker Workbox (CacheFirst assets, StaleWhileRevalidate API) |
| Auth pre-autenticada | `DEMO_USER` hardcoded en `authStore` |

---

## Success Metrics (Fase 1)

| Métrica | Criterio |
|---------|----------|
| Flujo cliente | El flujo Home → Pasillo → Producto → Carrito → Checkout → Confirmación → Timeline funciona de punta a punta sin errores |
| Flujo admin | El empleado puede ver un pedido, avanzar su estado y enviar el WhatsApp desde el panel admin |
| Deploy | La demo está disponible en URL pública instalable como PWA en dispositivo Android |
| Contrato de datos | Los interfaces de `mockOrderService` son idénticos al contrato del backend real (swap = cambio de import) |

---

## Risks

| Riesgo | Mitigación |
|--------|------------|
| Datos reales de L&M no disponibles antes del deploy | Usar datos provisionales; actualizar `mockData.ts` cuando el aliado confirme |
| Número real de WhatsApp de L&M pendiente | Parametrizar en `config/app.ts`; actualizar antes del deploy |
| Condiciones de red reales (3G Dolores) peores que el mock | Delay del mock es aproximación; Fase 2 validará en condición real |

---

## Critical E2E Test Scenarios

> **Prototype mode**: Tests automatizados omitidos. Los escenarios a continuación son la referencia de validación manual durante la sesión con usuarios (Fase 2).

### E2E Test Summary

| ID | Escenario | Prioridad |
|----|-----------|-----------|
| E2E-1 | Flujo completo punta a punta | 🔴 Crítico |
| E2E-2 | Guard de doble submit | 🔴 Crítico |
| E2E-3 | Persistencia del carrito | 🟡 Alto |
| E2E-4 | Navegación post-confirmación | 🟡 Alto |
| E2E-5 | Producto agotado | 🟡 Alto |
| E2E-6 | Catálogo offline | 🟡 Alto |
| E2E-7 | Producto de peso variable (kg) | 🟡 Alto |

### E2E-1: Flujo completo punta a punta 🔴

**Pasos**: Abrir app → Seleccionar pasillo → Tocar producto → Agregar al carrito → Ir a checkout → Elegir modalidad → Elegir sustitución → Tocar "Pedir mi Mercado" → Ver confirmación → Ver timeline de estado

**Resultado esperado**: El flujo completo funciona sin errores. El número de orden aparece en la pantalla de confirmación. El timeline muestra estado "Recibido".

### E2E-2: Guard de doble submit 🔴

**Pasos**: Llegar al step final del checkout → Tocar "Pedir mi Mercado" dos veces rápidamente

**Resultado esperado**: Solo se crea un pedido. El botón queda deshabilitado mientras `isSubmitting === true`.

### E2E-3: Persistencia del carrito

**Pasos**: Agregar productos al carrito → Cerrar la app (o recargar la página) → Volver a abrir

**Resultado esperado**: El carrito está intacto con los mismos productos y totales.

### E2E-4: Navegación post-confirmación

**Pasos**: Completar checkout → Ver pantalla de confirmación → Presionar Atrás

**Resultado esperado**: El usuario llega al Home, no al checkout ya enviado.

### E2E-5: Producto agotado

**Pasos**: Navegar a un producto con `inStock: false`

**Resultado esperado**: Badge "Agotado" visible. Botón `+` oculto o deshabilitado. No se puede agregar al carrito.

### E2E-7: Producto de peso variable

**Pasos**: Navegar al catálogo → encontrar un producto con `is_variable_weight: true` (queso campesino) → tocar FAB → seleccionar 0.75 kg → confirmar → ver carrito → tocar el botón de edición kg → ajustar a 1.5 kg → verificar que el total se actualiza

**Resultado esperado**: El pill en la card muestra "0.75 kg". El carrito muestra "× 0.75 kg" con subtotal correcto. Tras la edición, el subtotal refleja 1.5 kg × precio unitario.

### E2E-6: Catálogo offline

**Pasos**: Cargar la app con conexión → Desactivar conexión → Navegar al catálogo

**Resultado esperado**: El home y los productos del catálogo son visibles desde el Service Worker cache.

---

## Stages

| Stage | Status | Approved By | Approved At |
|-------|--------|-------------|-------------|
| functional | approved | Nixon Gamboa | 2026-06-02T06:34:22Z |
| functional (re-iteración Home/Layout/Taxonomía) | iterated | Nixon Gamboa | 2026-06-08 |
| functional (iteración ProductDetailSheet, peso variable kg, dark mode, shipping calc) | iterated | Nixon Gamboa | 2026-06-10 |
| functional (iteración routing completo: SearchPage, CatalogLandingPage, ComingSoonPage; Out of Scope actualizado) | iterated | Nixon Gamboa | 2026-06-11 |
| technical | approved | Nixon Gamboa | 2026-06-02T06:52:00Z |
| tasks | approved | Nixon Gamboa | 2026-06-02T07:05:00Z |
| implementation | in-progress | — | — |
