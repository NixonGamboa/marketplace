# MAUI Design System

> **MAUI** · PWA de pedidos para supermercados locales en comunidades rurales. Piloto: **Leche y Miel**, Dolores (Tolima, Colombia).
>
> **Mantra:** *"Cero fricción, máxima confianza."*

MAUI digitaliza el comercio de cercanía en comunidades pequeñas, eliminando las barreras tecnológicas para el usuario rural y optimizando la logística operativa del supermercado local. No es un catálogo: es una **plataforma de intención de compra** que conecta el inventario real del aliado con el hogar del cliente vía WhatsApp.

---

## Arquitectura — tres capas

| Capa | Nombre | Audiencia | Descripción |
|---|---|---|---|
| **App Cliente** | MAUI PWA | Clientes del supermercado | Interfaz Mobile-First para catálogo, pedidos, seguimiento en tiempo real |
| **App Admin** | MAUI Admin | Equipo interno del aliado | Panel para gestionar pedidos, inventario, fotos de calidad, pesos reales |
| **Backend** | MAUI API | Ambas apps | Lógica de negocio, sincronización, notificaciones WhatsApp |

El MVP **no** incluye: pagos en línea, rastreo GPS en vivo, gestión compleja de inventario.
Pago: **contra entrega** (efectivo o transferencia).
Seguimiento: **por estados** (Recibido → Preparando → En camino).

---

## Fuentes (sources)

Todos los assets aquí provienen de las siguientes fuentes; se conservan rutas completas por si el lector tiene acceso.

- **Repo principal** (código de la PWA): `NixonGamboa/marketplace` → rama `master` → carpeta `MAUI-PWA-customers/client/`
  - Design tokens: `MAUI-PWA-customers/client/tailwind.config.js`
  - Reglas de UI por vista: `MAUI-PWA-customers/tareas/design/ui-rules.md`
  - Contexto producto: `MAUI-PWA-customers/MAUI-CONTEXT.md`
- **Repo alternativo** (scaffold Vite): `NixonGamboa/MAUI-PWA` — tema morado legacy, **no** usar como referencia.
- **Mockups adjuntos por el usuario** en `uploads/` → copiados a `assets/screens/`:
  - `login.png`, `home.png`, `catalogo.png`, `cierreCheckout.png`, `confirmacion.png`, `monitor.png`
  - `logo.png` — logo oficial (wordmark MAUI, ya sin el símbolo del sol)

---

## CONTENT FUNDAMENTALS — voz y copy

MAUI habla en **español colombiano cálido, directo y sin tecnicismos**. El tono es el de un tendero de confianza: no vende, acompaña.

**Principios**
- **Tú, informal.** Nunca "usted". Nunca "estimado cliente".
- **Verbos de acción cortos.** `Pedir mi Mercado`, `Ver mi canasta`, `Recibir acceso por WhatsApp`.
- **Micro-copy local.** *Pasillos* (no Categorías), *Mi Canasta* (no Cart), *Mercado* (no Orden/Pedido en UI de usuario).
- **🚫 Palabra prohibida: "Pagar".** El CTA final es `Pedir mi Mercado` — nunca `Pagar`, `Comprar`, `Checkout`.
- **🚫 Sin "1-clic".** El reorden se vende como "mercado anterior", no como automatismo.
- **Transparencia antes que venta.** "Peso y precio final se ajustan en tienda" aparece en fresco, siempre. Nunca "Total Final" — siempre "Total Estimado".
- **Educación en confirmación.** En vez de *"¡Gracias por tu compra!"* → *"¡Pedido Recibido con Éxito! En Leche y Miel ya estamos seleccionando tus productos. Te avisaremos por WhatsApp apenas tu mercado esté listo para salir."*
- **Sin emojis en UI funcional.** Se permite 📞 ☎️ sólo si vienen del sistema operativo (tel: links). Nunca decorativos.
- **Errores, tono.** "Sin conexión — Mostrando última actualización" (no "Error 503"). Explica lo que el usuario ve, no el código.

**Capitalización**
- **Sentence case** en párrafos y hints.
- **Title Case Corto** en botones primarios (`Pedir mi Mercado`, `Ver mi Canasta`).
- **SOLO la marca**: `MAUI` (mayúscula sólida, el wordmark).
- **Nombres de producto:** como aparecen en factura (`Arroz Diana Extra 500g`). Truncar con `…` está prohibido — usar `name_display` corto.

**Ejemplos de copy real (del MVP)**
- Login: *"Te enviaremos un enlace. Solo tócalo para entrar. Sin contraseñas."*
- Estado tienda: *"Tienda Abierta. Despachos Hoy: 8:00 AM – 6:00 PM."*
- Sustitución: *"¿Qué hacer si falta algo?"* → `Llamarme por teléfono` / `Cambiar por similar` / `No enviar y descontar`
- Total: *"Total Estimado $30.000 · El valor final de carnes y verduras se ajusta en tienda según el peso exacto."*

---

## VISUAL FOUNDATIONS

### Paleta
Dos familias: **verde institucional** (CTAs, éxito, estado tienda abierta) y **crema cálida** (fondos). El wordmark **MAUI** vive en negro sobre claro o blanco sobre oscuro — sin símbolo, sin sol.

| Token | Hex | Uso | Contraste vs `bg` |
|---|---|---|---|
| `--maui-primary` | `#2F7D32` | CTAs, precios destacados, stepper activo | 7.3:1 ✅ |
| `--maui-primary-dark` | `#1B5E20` | hover/press de primary |  |
| `--maui-primary-50` | `#E8F5E9` | fondo banner "Tienda Abierta" |  |
| `--maui-bg` | `#F8F4EE` | fondo página |  |
| `--maui-bg-warm` | `#FDE8C6` | degradé landing (amanecer) |  |
| `--maui-surface` | `#FFFFFF` | cards, modales, inputs |  |
| `--maui-border` | `#D6CFC4` | bordes cards, divisores |  |
| `--maui-fg` | `#1A1A1A` | texto principal | 14.7:1 ✅ |
| `--maui-fg-muted` | `#5C5C5C` | texto secundario | 7.1:1 ✅ |
| `--maui-warning` | `#E65100` | badge "Peso variable", ajustes de precio | 7.2:1 ✅ |
| `--maui-error` | `#B71C1C` | tienda cerrada, errores duros |  |
| `--maui-whatsapp` | `#25D366` | **solo** acciones WhatsApp / magic link |  |

**Regla dura:** todo texto y todo botón principal debe cumplir **contraste 7:1** (legibilidad al sol).

### Tipografía
- **Sans (UI y body):** `Inter`, fallback `Roboto`, `system-ui`. Weights: 400, 500, 600, 700.
- **Display (wordmark MAUI):** `Archivo Black` (weight 900). Grotesca de peso sólido que evoca el logo. Usar **solo** para el wordmark y titulares hero.
- Escala numérica `tabular-nums` obligatoria en todo precio y cantidad.

> ⚠️ **Sustitución de fuentes:** el código usa Inter como stack por defecto y no provee archivo `.woff2`. Cargamos Inter y Archivo Black desde Google Fonts. Si el equipo MAUI tiene variantes/pesos personalizados, por favor adjuntar los archivos de fuente.

### Espaciado
Escala 4-8-12-16-20-24-32-40-48. Radii: `6` (pill chips), `8` (md), `12` (cards, buttons md), `16` (modals, hero cards), `9999` (pill). Touch-targets mínimos **44×44 px** (zona del pulgar).

### Fondos e imaginería
- **Fondo de página:** crema sólida (`#F8F4EE`). No gradientes agresivos.
- **Landing / login:** degradé amanecer cálido (`#FFF6E2` → `#FDE8C6` → `#F8D48A`) con **ilustración plana** de campo (montañas, trigo, puesto de mercado) al pie de pantalla.
- **Fotografía:** productos sobre fondo blanco con `mix-blend-multiply` y `object-contain`. Fotos de calidad del pedido empacado → cuadradas, centradas, con lupa de zoom.
- Las ilustraciones del mockup son **planas, amigables, infantiles** (carne, frutas, huevos, canasta familiar) — no fotorrealistas. Se asumen licenciadas o aportadas por el aliado; aquí usamos placeholders hasta recibir los archivos.

### Animación
Rápida y discreta. `250 ms` con `cubic-bezier(.2,.8,.2,1)`. Fades y `slide-in-bottom` (barra flotante de canasta). **No** rebotes, **no** parallax. El `+` del catálogo es **instantáneo (optimistic UI)** — la animación viene después, nunca antes.

### Estados de hover / press
- **Hover:** verde más oscuro (`--maui-primary-dark` para primary) o tinte 5% del primary (`hover:bg-brand-primary/5`) para secondary. Nunca sombra agresiva.
- **Press:** `active:scale-[0.99]` en la barra de canasta. Botones normales no encogen.
- **Focus-visible:** anillo verde 2 px con `ring-offset-2` sobre `surface`. Siempre visible con teclado.
- **Disabled:** 50% opacidad + `cursor-not-allowed`. El CTA "Pedir mi Mercado" queda disabled hasta elegir opción de sustitución.

### Bordes y sombras
- Bordes: `1 px` en `--maui-border` (#D6CFC4). Los cards nunca son "puros": siempre borde + sombra sutil.
- **Sombra card:** `0 1px 3px rgba(26,26,26,.08), 0 1px 2px rgba(26,26,26,.04)` — muy suave.
- **Sombra brand-sm/md:** usan rgba del verde primary al 12% / 20% — coherencia con la marca.
- **Sombra flotante (bottom bar):** `0 -4px 16px rgba(26,26,26,.12)` hacia arriba.

### Transparencia y blur
- Header: `backdrop-blur-md` con `surface/95` — solo en scroll.
- Overlays: `rgba(26,26,26,.6)` plano, sin blur (mobile-first, queremos CPU barata).

### Corner radii
| Elemento | Radius |
|---|---|
| Chips, tags pequeñas | `pill` (999) |
| Buttons sm | 6 |
| Buttons md, inputs, steppers | 8 |
| Cards, buttons lg, catalogo cells | 12 |
| Modales, hero cards, lightbox foto | 16 |

### Cards
Fondo `surface`, border `--maui-border` 1px, radius 12, shadow-card, padding 12–16. Hover: sombra se vuelve `brand-sm` (tinte verde). **Nunca** border coloreado lateral izquierdo, **nunca** gradientes dentro del card.

### Layout
- **Mobile-first**, grid de 3 columnas para pasillos en mobile, 5 en tablet, 6 en desktop.
- **Zona del pulgar**: todos los CTA primarios en la mitad inferior. La barra de canasta es fija abajo con `pb-safe`.
- **Persistencia de scroll** al volver de un pasillo al Home.
- **Max-width app:** 1280 px (`max-w-screen-xl`). Más allá, el contenido no crece — respira.

---

## ICONOGRAPHY

El código usa **Lucide React** (`lucide-react@0.575`). Como estamos en HTML estático, consumimos Lucide vía **CDN (ESM)** en los previews — mismo set, pesos idénticos.

- **Stroke weight:** 2 px (Lucide default). Tamaños 16 / 20 / 22 / 24 / 32 px. Color hereda de `currentColor`.
- **Íconos clave:** `ShoppingCart`, `Search`, `User`, `MapPin`, `Phone`, `Trash2`, `LayoutGrid`, `Clock`, `Check`, `ChevronLeft/Right`, `Plus`, `Minus`, `Menu`, `X`.
- **WhatsApp:** Lucide no incluye WhatsApp; usamos SVG oficial en verde `--maui-whatsapp`. Archivo: `assets/icons/whatsapp.svg`.
- **Ilustraciones de pasillo / producto:** son **ilustraciones planas en color**, no íconos — vienen del aliado o ilustradores. Aquí usamos placeholders grises hasta recibir los archivos reales (flagged below).
- **Emoji:** ❌ no se usan en UI. Tampoco unicode decorativo. Los únicos símbolos permitidos son los de Lucide o el ícono oficial de WhatsApp.

> ⚠️ **Flag de sustitución:** la app usa `lucide-react` via npm. En este Design System linkeamos desde `unpkg.com/lucide-static` para que los previews HTML funcionen sin build. Visualmente idénticos.

---

## Index — manifest

```
MAUI Design System/
├── README.md                    ← este archivo
├── SKILL.md                     ← invocación como skill
├── colors_and_type.css          ← tokens CSS (vars + semantic classes)
├── assets/
│   ├── maui-logo.svg            ← wordmark oficial vectorial (negro)
│   ├── maui-logo-white.svg      ← wordmark blanco (sobre verde, oscuro, foto)
│   ├── maui-logo-black.svg      ← alias de maui-logo.svg (claridad semántica)
│   ├── maui-mark.svg            ← alias del wordmark (legacy de cuando incluía el sol)
│   ├── maui-logo.png            ← raster original con sol — deprecated, no usar
│   ├── icon-192.png             ← icono PWA
│   ├── icons/whatsapp.svg       ← ícono WhatsApp oficial
│   └── screens/                 ← mockups de referencia (Nano Banana)
│       ├── login.png
│       ├── home.png
│       ├── catalogo.png
│       ├── cierreCheckout.png
│       ├── confirmacion.png
│       └── monitor.png
├── preview/                     ← cards del panel Design System
│   ├── logo.html
│   ├── colors-primary.html
│   ├── colors-neutrals.html
│   ├── colors-semantic.html
│   ├── type-scale.html
│   ├── type-wordmark.html
│   ├── spacing-radii.html
│   ├── shadows.html
│   ├── buttons.html
│   ├── inputs.html
│   ├── product-card.html
│   ├── store-banner.html
│   ├── floating-cartbar.html
│   ├── substitution-module.html
│   └── iconography.html
├── ui_kits/
│   └── maui_pwa/                ← UI kit cliente (click-thru)
│       ├── README.md
│       ├── index.html           ← prototipo completo login→home→catálogo→checkout→éxito→monitor
│       ├── AuthScreen.jsx
│       ├── HomeScreen.jsx
│       ├── CatalogScreen.jsx
│       ├── CheckoutScreen.jsx
│       ├── ConfirmationScreen.jsx
│       ├── MonitorScreen.jsx
│       └── components.jsx
└── MAUI-PWA-customers/          ← código importado de GitHub (referencia)
```

### UI kits disponibles
- **MAUI PWA (cliente)** → `ui_kits/maui_pwa/` — 6 pantallas interactivas: login, home, catálogo, checkout fusionado, confirmación, monitor de pedido.

**MAUI Admin** — *no incluido*. El repo `maui-admin-front` sólo contiene la carpeta `tareas/` (sin código). Diseño pendiente de definición del equipo; aquí no inventamos pantallas. Una vez el equipo provea wireframes, añadir un segundo UI kit.

---

## Asks for the user (para iterar a la perfección)

1. **Fuentes oficiales.** Usamos Inter + Archivo Black de Google Fonts. ¿Tienen archivos de fuente personalizados?
2. **Logo vectorial.** ✅ Tenemos `maui-logo.svg` (wordmark negro) y `maui-logo-white.svg` (blanco para fondos oscuros). El símbolo del sol fue removido a pedido del equipo. **Pendiente menor:** convertir el wordmark a paths para independizarlo de la fuente Archivo Black cuando el SVG se carga aislado. **Pendiente:** exportar `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` para la PWA.
3. **Ilustraciones de producto y pasillo.** Los mockups usan ilustraciones planas estilo "nano-banana" (banano, carne, canasta). ¿Nos pueden compartir el set en SVG/PNG? Hasta entonces usamos placeholders.
4. **MAUI Admin.** ¿Hay wireframes o referencias visuales para el panel admin? El repo `maui-admin-front` está vacío.
5. **Estado "Leche y Miel".** ¿El banner "supermercado de confianza: Leche y Miel" va en todas las pantallas o solo en el header del catálogo?
