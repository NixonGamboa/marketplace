# MAUI: Tu Mercado Local, Digital y Sin Fricción

## Objetivo Principal

Digitalizar el comercio de cercanía en comunidades pequeñas (como Dolores, Tolima), eliminando las barreras tecnológicas para el usuario rural y optimizando la logística operativa del supermercado local.

> **Mantra:** "Cero fricción, máxima confianza."

---

## ¿Qué es MAUI?

Es una PWA (Progressive Web App) diseñada bajo un enfoque de **Mobile-First y baja conectividad**. No es solo un catálogo; es una plataforma de **"intención de compra"** que conecta el inventario real del aliado (ej. Leche y Miel) con el hogar del cliente a través de herramientas cotidianas como WhatsApp.

---

## Arquitectura: Las Tres Capas del Sistema

MAUI está compuesto por tres piezas que trabajan juntas:

| Capa | Nombre | Audiencia | Descripción |
|---|---|---|---|
| **App Cliente** | MAUI PWA | Clientes del supermercado | Interfaz Mobile-First para explorar el catálogo, crear pedidos y hacer seguimiento en tiempo real |
| **App Admin** | MAUI Admin | Equipo interno del aliado | Panel de administración para gestionar pedidos, actualizar inventario, subir fotos de calidad y confirmar pesos reales |
| **Backend** | MAUI API | Ambas apps | Orquesta la lógica de negocio, sincroniza estados, gestiona notificaciones por WhatsApp y expone los datos a las dos interfaces |

```
[Cliente] → MAUI PWA ─┐
                       ├──→ MAUI API (Backend) ──→ [WhatsApp / Inventario]
[Admin]  → MAUI Admin ─┘
```

---

## Scope: ¿Qué hace? (Dentro del MVP)

| Funcionalidad | Descripción |
|---|---|
| **Acceso Simple** | Autenticación mediante Magic Link vía WhatsApp (sin contraseñas) |
| **Reordenamiento Rápido** | Permite repetir mercados anteriores en dos clics |
| **Gestión de Pesos Reales** | Informa y ajusta el precio final de productos frescos (carnes, frutas, verduras) tras el pesaje físico en tienda |
| **Transparencia Total** | Monitor de pedido en tiempo real con foto de calidad del mercado ya empacado |
| **Sustitución Inteligente** | Obliga a definir qué hacer si un producto se agota (Llamar, cambiar o quitar) antes de finalizar el pedido |
| **Optimización Rural** | Interfaz para la "zona del pulgar" y carga ultrarrápida en redes 3G/4G |

---

## Fuera de Scope: ¿Qué NO hace?

| Límite | Razón |
|---|---|
| **Pagos en línea** | No integra pasarelas (PayU, Stripe, etc.). Todo es Pago Contra Entrega (efectivo o transferencia local) |
| **Cobro automático** | No procesa transacciones; el pedido es una confirmación de intención hasta la entrega física |
| **Rastreo GPS en vivo** | No es un "Uber" de domicilios; el seguimiento es por estados (Recibido → Preparando → En camino) |
| **Gestión de inventario complejo** | No sustituye el ERP del supermercado; solo sincroniza disponibilidad y precios de forma ágil |

---

## Contexto Operativo

- **Aliado actual:** Leche y Miel (supermercado local en Dolores, Tolima)
- **Canal de comunicación:** WhatsApp (principal medio del usuario objetivo)
- **Perfil del usuario:** Familias en comunidades pequeñas, con acceso limitado o intermitente a internet
- **Stack tecnológico:** PWA con soporte offline, Mobile-First, optimizado para 3G/4G

---

## Seguridad — Limitación de la demo (R-6 / RT-4)

Durante la Fase 1 (demo con mocks) toda la persistencia vive en el navegador del
operador vía `localStorage` / `sessionStorage`:

- Sesiones del admin en `sessionStorage['maui-admin-session']`.
- Catálogo, merchant, horario y audit log en claves `localStorage['maui-admin-*']`.
- Pedidos del cliente ↔ admin en `localStorage['maui-orders']`.

Consecuencias aceptadas para el demo:

- Cualquier persona con acceso al dispositivo puede leer o modificar el estado desde DevTools.
- El hash del password NO se calcula: `mockAuthRepository` compara texto plano contra
  `VITE_ADMIN_USERS` (env) o su fallback de fábrica. No es un modelo de auth productivo.
- La demo NO debe desplegarse con datos sensibles reales. Cuando llegue Sprint 1 y
  `VITE_DEMO_MODE=false`, `services/index.ts` conmuta al `realXxxRepository`
  (auth provider real + backend — stack en `docs/adr-001-vercel-postgres-first.md`)
  y esta capa desaparece.
