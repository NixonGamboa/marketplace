# MAUI PWA — UI Kit

Interactive, click-through recreation of the MAUI customer PWA based on:
- Design tokens from `../../MAUI-PWA-customers/client/tailwind.config.js`
- UI rules in `../../MAUI-PWA-customers/tareas/design/ui-rules.md`
- Mockups in `../../assets/screens/`

Open `index.html` to walk the full flow:

**Auth → Home → Pasillo (Frutas y Verduras) → Mi Canasta + Checkout → ¡Pedido Recibido! → Monitor de Pedido**

Mobile-first. Rendered inside an iOS frame. Resize the window: the prototype is fluid up to 420 px wide.

## Files
- `index.html` — app shell and router (no build; inline Babel JSX)
- `components.jsx` — Button, Input, ProductCard, PasilloCard, StoreBanner, FloatingBar, Stepper, icons
- `AuthScreen.jsx` — magic-link por WhatsApp
- `HomeScreen.jsx` — banner + reordenar + "Lo que no puede faltar" + Pasillos grid
- `CatalogScreen.jsx` — grid de pasillo con badges peso variable + barra flotante
- `CheckoutScreen.jsx` — canasta fusionada con checkout + módulo de sustitución
- `ConfirmationScreen.jsx` — success + resumen de referencia
- `MonitorScreen.jsx` — stepper de estados + foto de calidad + ajustes de precio
- `data.js` — catálogo mock + órdenes
