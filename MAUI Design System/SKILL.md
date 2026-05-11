---
name: maui-design
description: Use this skill to generate well-branded interfaces and assets for MAUI — a mobile-first, low-connectivity PWA for ordering groceries from local rural supermarkets in Colombia (pilot with Leche y Miel in Dolores, Tolima). Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping the customer PWA, admin panel, and related marketing material.
user-invocable: true
---

Read the `README.md` file within this skill first — it contains the brand positioning, content tone (Spanish, informal "tú", rural-Colombia voice), visual foundations, iconography rules, and a manifest of every other file.

Then explore the other available files as needed:

- `colors_and_type.css` — source of truth for color tokens (`--maui-primary`, `--maui-bg`, etc.), typography scale, spacing, radii, shadows, and `.maui-*` semantic type classes. Import this into every artifact.
- `assets/` — logo SVG/PNG, icon PWA, co-brand partner logos. Use these instead of redrawing.
- `ui_kits/maui_pwa/` — reusable React components (Button, Input, ProductCard, StoreBanner, FloatingCart, TabBar, icons) plus the 6-screen click-through prototype: Auth → Home → Catalog → Checkout (with Substitution Module) → Confirmation → Monitor. Copy components from here rather than recreating them.
- `preview/` — small reference cards showing every token and component in isolation.

**When creating visual artifacts** (slides, mocks, throwaway prototypes): copy assets out of `assets/`, include `colors_and_type.css`, and produce static HTML files for the user to view. Use the tokens — never invent new colors or font sizes. Respect the mantra: **"Cero fricción, máxima confianza."**

**When working on production code:** copy assets and read the guidelines here to become an expert in designing with this brand. Prioritize mobile-first, thumb-zone ergonomics, and performance on 3G/4G — this is the core operating constraint.

**If the user invokes this skill without any other guidance**, ask what they want to build (new PWA screen? admin view? marketing landing? WhatsApp template?), ask clarifying questions about scope, audience, and whether they want divergent variations, and then act as an expert designer — output either HTML artifacts or production code depending on the need.

Key constraints to always respect:
- **Spanish (Colombia).** Informal "tú". Short, warm, actionable copy. No English mixed in for user-facing text.
- **Mobile-first, 390px design width.** All tap targets ≥ 44px. Primary CTAs sit at the bottom in the thumb zone.
- **Pago contra entrega only.** Never show payment method pickers, card forms, or Stripe/PayU/PSE integrations.
- **WhatsApp is the communication channel.** Use the `#25D366` green only for WhatsApp-specific actions (magic link, contacting the store).
- **Peso variable is a first-class concept.** Any fresh product (carnes, frutas, verduras, pescados) must show the orange "Peso var." badge and surface the "total may adjust after weighing" caveat.
- **Substitution is obligatory at checkout.** If showing a checkout flow, every item must have a policy chosen (llamar / cambiar / quitar) before the confirm CTA enables.
- **No emoji in functional UI** (they're fine as data placeholders like pasillo icons). No gradient-heavy marketing tropes. No colored-left-border cards.
