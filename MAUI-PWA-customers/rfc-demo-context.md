# Contexto RFC — Sprint DEMO: MAUI PWA Customers

> **Propósito de este documento:** Insumo técnico y de producto para el RFC del Sprint DEMO de MAUI PWA Customers. Consolida el estado actual del proyecto, el objetivo de la demo, los principios de ingeniería que guían las decisiones y el alcance de lo que se construye en esta fase.

---

## 1. ¿Qué es MAUI?

MAUI es una Progressive Web App que digitaliza el comercio de cercanía en comunidades rurales colombianas. El primer aliado es **Leche y Miel**, supermercado en Dolores, Tolima.

**Mantra:** "Cero fricción, máxima confianza."

**Flujo mínimo de valor (el loop que debe funcionar):**

```
Doña Carmen
  → abre la PWA en Samsung A13 con 3G
  → ve queso campesino y carne molida en el catálogo
  → agrega al carrito
  → toca "Pedir mi Mercado"
  → ingresa nombre y ubicación
  → confirma
  → recibe WhatsApp de confirmación
  → admin procesa el pedido
  → recibe actualizaciones de estado
  → domicilio llega
  → paga en efectivo
```

**Arquitectura de tres capas:**

| Capa | Proyecto | Estado actual |
|------|----------|--------------|
| App cliente | MAUI PWA Customers (este proyecto) | ~55% UI lista, sin backend |
| Panel admin | MAUI Admin Front | 0% — no iniciado |
| Backend | MAUI API (AWS SAM) | 0% — no iniciado |

---

## 2. Estado Actual del Proyecto (Mayo 2026)

### Lo que existe y funciona

| Componente | Estado | Notas |
|------------|--------|-------|
| `cartStore` (Zustand + persist) | Completo | localStorage `maui-cart`, staleness 30d, cálculo de totales |
| `StoreStatusBanner` | Completo | Calcula estado por hora local, preparado para API |
| Home con carousel + PasillosGrid | Completo | Datos mock |
| `ProductCard` con badges | Completo | `inStock`, `is_variable_weight`, `badge` |
| `FloatingCartBar` | Completo | Animación, sólo visible si `count ≥ 1` |
| `ErrorBoundary` a nivel App | Completo | Fallback UI |
| PWA Service Worker (Workbox) | Completo | CacheFirst imágenes, StaleWhileRevalidate API |
| Design system (Tailwind) | Completo | Tokens WCAG 2.1 AA, colores MAUI |
| Tipos TypeScript (`Product`, `CartItem`, `Category`) | Completo | Estrictos, listos para conectar API |
| `useCatalog` hooks (React Query) | Completo estructura | Apuntan a mocks, listos para swapear |
| Mock data (`mockData.ts`) | Parcial | 10 productos placeholder, no datos reales de L&M |

### Lo que NO existe (gaps para la demo)

| Componente | Impacto en demo |
|------------|----------------|
| `/catalog/:categoryId` page | Bloqueante — el usuario no puede navegar por pasillo |
| `/search?q=` page | Bloqueante — no hay búsqueda |
| `/checkout` page | Bloqueante — el loop de valor no cierra |
| `/orden/:orderId` page | Bloqueante — el usuario no puede ver el estado |
| `OrdersPage` funcional | Importante — hoy es un placeholder vacío |
| Datos reales de Leche y Miel | Crítico — la demo con "Producto 1" no convence |
| Auth mock (usuario simulado) | Necesario para checkout sin backend |
| Panel admin demo | Necesario para validar el lado operativo |

### Bugs conocidos

| Bug | Archivo | Fix requerido |
|-----|---------|---------------|
| CTA incorrecto en cart | `CartPage.tsx` | "Confirmar pedido" → "Pedir mi Mercado" |
| Número de WhatsApp placeholder | `app.ts` | Reemplazar con número real de Leche y Miel |

---

## 3. Objetivo del Sprint DEMO

### ¿Por qué una demo antes del backend?

Construir el backend cuesta 4–6 semanas. Si el flujo de UX tiene problemas de comprensión, confianza u operación, es 10x más barato descubrirlos en el demo que después de tener Lambda + DynamoDB corriendo.

### ¿Qué es una "demo convincente" para MAUI?

**No es un prototipo de Figma.** Es una PWA desplegada en una URL real, instalable en celular, con:
- Datos reales del catálogo de Leche y Miel (fotos reales, precios reales en COP, nombres reales)
- Todos los flujos completos funcionando de punta a punta
- Respuestas de "API" simuladas con delay de 800–1200ms (simula latencia real en 3G)
- Instalable en Android e iOS como PWA

### Criterio de Go/No-Go (salida del Sprint DEMO)

**Con clientes (usuarios de Dolores):**
- [ ] Al menos 4 de 5 usuarios responden "Sí" a "¿Lo usarías para tu próximo mercado?"
- [ ] Al menos 3 de 5 lo recomendarían a un vecino (pregunta directa al final de la sesión)
- [ ] Ningún usuario necesitó que el facilitador le indicara el siguiente paso
- [ ] No hay fricciones críticas que requieran rediseño de flujos

**Con el aliado (Leche y Miel):**
- [ ] El empleado procesó 3 pedidos de prueba sin preguntar cómo avanzar el estado
- [ ] El empleado entendió la diferencia entre pickup y domicilio sin explicación
- [ ] El empleado supo qué mensaje de WhatsApp enviar en cada transición de estado
- [ ] El encargado de la tienda responde "Sí" a "¿Confiarías en esto durante tu hora más ocupada?"

**Decisión final:**
- [ ] Stakeholders dan Go explícito para proceder a implementación real

---

## 4. Alcance Funcional del Sprint DEMO

### Flujos que deben funcionar de punta a punta

```
1. Navegar catálogo
   Home → tap pasillo → CatalogPage → scroll productos → tap producto → modal detalle

2. Gestionar carrito
   ProductCard → tap + → FloatingCartBar aparece → /cart con items → ajustar cantidades

3. Checkout completo (mock)
   /checkout →
     Step 1: resumen del carrito (readonly)
     Step 2: modalidad (Recoger / Domicilio + dirección)
     Step 3: preferencia de sustitución (radio)
     Step 4: confirmación → orden generada localmente → /orden/:id

4. Ver estado del pedido
   /orden/:id → timeline de 5 estados → botón WhatsApp prellenado

5. Admin demo (panel del empleado)
   /admin (proyecto separado) → ver pedido → avanzar estado → link WhatsApp
```

### Lo que NO entra en el Sprint DEMO

- Backend real (Lambda, DynamoDB, API Gateway)
- WhatsApp Magic Link real
- SearchPage (`/search?q=`) — los pasillos son suficientes para navegar ~15 productos; si la sesión de validación revela que los usuarios la necesitan, ese es el aprendizaje que la justifica
- Fotos de pedido desde S3
- Módulo financiero / wallet
- WebSockets para tiempo real
- Notificaciones push reales
- Peso variable (`is_variable_weight`) — ver sección 8
- Múltiples aliados

---

## 5. Principios de Ingeniería

### 5.1 SOLID aplicado a esta app

MAUI es una SPA de tamaño mediano. Los principios se aplican con pragmatismo, sin sobreingeniería.

**S — Single Responsibility**
Cada módulo tiene una sola razón para cambiar:
- `cartStore` → sólo maneja el estado del carrito
- `useCatalog` → sólo resuelve el fetching de catálogo
- `ProductCard` → sólo renderiza un producto, no decide cómo se agrega
- `mockOrderService` (nuevo) → sólo simula respuestas de la API de órdenes
- Un componente de página (ej. `CatalogPage`) sólo orquesta, no contiene lógica de negocio

**O — Open/Closed**
Los hooks de data fetching están diseñados para extensión sin modificación:
```typescript
// useCatalog.ts — swappear queryFn es el único cambio para pasar de mock a real
const { data } = useQuery({
  queryKey: ['products'],
  queryFn: () => fetchProducts(), // ← mock hoy, API real mañana
  staleTime: 5 * 60 * 1000,
})
```
Los stores de Zustand exponen una API estable; la implementación interna puede cambiar.

**L — Liskov Substitution**
Los `mockServices` deben implementar exactamente la misma firma de tipos que los servicios reales:
```typescript
// Contrato que mock y real deben cumplir
interface OrderService {
  submit(payload: OrderPayload): Promise<OrderConfirmation>
  getById(orderId: string): Promise<Order>
  list(): Promise<Order[]>
}
```
El día que llega el backend real, se swappea la implementación, no la interfaz.

**I — Interface Segregation**
No crear hooks ni stores "todo en uno". Separar:
- `useCart` → sólo interacción con carrito
- `useCheckout` → sólo flujo de checkout (nuevo en Sprint DEMO)
- `useOrders` → sólo lista/detalle de órdenes
- `useAuthState` → sólo lectura del estado auth (sin lógica de login)
Evitar que un componente dependa de métodos de un store que no usa.

**D — Dependency Inversion**
Los componentes dependen de abstracciones (hooks, servicios), no de implementaciones concretas:
```typescript
// Bien: el componente consume el hook, no accede directamente a mockData ni localStorage
const { orders, isLoading } = useOrders()

// Mal: el componente importa directamente mockOrders
import { mockOrders } from '../catalog/mockData'
```
La inversión de dependencia es lo que hace posible swapear mocks por API real sin tocar un componente.

---

### 5.2 Clean Code para este proyecto

**Nombrado en dominio de negocio, no técnico:**

| Evitar | Preferir |
|--------|----------|
| `CartContainer` | `CartPage` |
| `ProductListItem` | `ProductCard` |
| `handleButtonClick` | `handleAddToCart` |
| `data`, `res`, `info` | `product`, `order`, `category` |
| `isLoading` genérico | `isCatalogLoading`, `isSubmitting` |

**Reglas de componentes:**
- Un componente que hace `fetch` + `render` + `lógica de negocio` viola SRP → separar en hook + componente presentacional
- Máximo ~150 líneas por componente. Si crece más, extraer
- Props tipadas siempre, sin `any`
- Evitar `useEffect` para sincronización de estado derivado → usar `useMemo` o derivar en el store

**Reglas de stores (Zustand):**
- El store no sabe nada de la UI (no importa componentes)
- Los selectores se definen fuera del store para reusabilidad:
  ```typescript
  const cartCount = useCartStore(s => s.count) // ← selector inline mínimo
  const selectCartItems = (s: CartState) => s.items // ← selector reutilizable
  ```
- Las acciones son verbos explícitos: `addItem`, `removeItem`, `clearCart`, nunca `update` o `set`

**Reglas de hooks:**
- Un hook = una responsabilidad
- Prefijo `use` siempre
- Retornar objetos nombrados, no tuplas (facilita extensión):
  ```typescript
  return { product, isLoading, error } // ✅
  return [product, isLoading]          // ❌ — rompe con extensión
  ```

**Reglas de archivos:**
- `features/<nombre>/` → todo lo relacionado a esa feature
- `shared/` → sólo lo que usan 3+ features
- `services/` → contratos e implementaciones de comunicación externa
- No crear `utils/helpers/misc` genéricos → si algo está en `utils`, probablemente tiene un mejor hogar

---

### 5.3 Escalabilidad sin sobreingeniería

El tamaño de MAUI PWA Customers en el horizonte visible es: ~10 rutas, ~30 componentes, ~5 stores, ~8 hooks. No es una app enterprise. Las decisiones de arquitectura deben ser proporcionales a ese tamaño.

**Qué NO hacer en esta app:**
- No crear un sistema de inyección de dependencias custom
- No implementar Redux, Context API o MobX — Zustand es suficiente y correcto
- No abstraer hasta que haya 3+ instancias reales del patrón (regla de tres)
- No crear capas de repositorio, casos de uso, o mappers propios — React Query + hooks es la arquitectura correcta para este tamaño
- No añadir feature flags, A/B testing, o sistemas de configuración dinámica hasta que haya un caso de negocio concreto

**Qué SÍ hacer para soportar crecimiento natural:**
- Mantener la estructura `features/<nombre>/` consistente — permite agregar features sin conflictos
- Definir contratos de servicio (interfaces TypeScript) antes de implementar mocks — swappear por real es un cambio de una línea
- Centralizar configuración en `config/app.ts` — cambiar un número de teléfono o un horario no debe requerir buscar en 5 archivos
- Tipar los datos de API desde el inicio — cuando llegue el backend real, TypeScript protege el contrato

**La pregunta correcta ante cada decisión:**
> "¿Esta abstracción me da flexibilidad real que voy a usar en los próximos 2 sprints, o sólo me da la sensación de que el código es 'profesional'?"

Si la respuesta es lo segundo: no añadirla.

---

## 6. Arquitectura Técnica del Sprint DEMO

### Stack (sin cambios al existente)

```
React 19 + TypeScript 5.8 (strict)
├── Estado:          Zustand 5 (persist para carrito)
├── Data fetching:   TanStack React Query 5 (staleTime configurado por tipo de dato)
├── Routing:         React Router 7 (lazy loading por ruta)
├── Estilos:         TailwindCSS 3 (design tokens MAUI)
├── PWA:             Workbox via vite-plugin-pwa (CacheFirst + StaleWhileRevalidate)
├── Icons:           Lucide React
└── Build:           Vite 7
```

### Nuevos módulos para el Sprint DEMO

```
src/
├── features/
│   ├── catalog/
│   │   ├── CatalogPage.tsx          ← NUEVO: listado por pasillo
│   │   ├── SearchPage.tsx           ← NUEVO: búsqueda local
│   │   ├── ProductDetailModal.tsx   ← NUEVO: modal de detalle
│   │   └── mockData.ts              ← ACTUALIZAR: datos reales L&M
│   ├── checkout/
│   │   ├── CheckoutPage.tsx         ← NUEVO: flujo 4 steps
│   │   ├── DeliverySelector.tsx     ← NUEVO
│   │   ├── SubstitutionSelector.tsx ← NUEVO
│   │   └── checkoutStore.ts         ← NUEVO: Zustand store de checkout
│   ├── orders/
│   │   ├── OrdersPage.tsx           ← REEMPLAZAR placeholder
│   │   ├── OrderDetailPage.tsx      ← NUEVO: timeline + estado
│   │   └── OrderTimeline.tsx        ← NUEVO: componente de timeline
│   └── auth/
│       └── authStore.ts             ← ACTUALIZAR: usuario mock simulado
│
└── services/
    ├── mockOrderService.ts          ← NUEVO: simula POST /orders + GET /orders/:id
    └── api.ts                       ← EXISTENTE: preparado para URL real
```

### Estrategia de mocks para la demo

Los mocks deben respetar el **contrato de la API real** que se definirá en Sprint 1. Esto garantiza que el swapeo sea quirúrgico.

```typescript
// services/mockOrderService.ts
// Misma firma que tendrá el servicio real
export const mockOrderService: OrderService = {
  async submit(payload: OrderPayload): Promise<OrderConfirmation> {
    await delay(1200) // simula latencia 3G
    return {
      orderId: `MAUI-${Date.now()}`,
      status: 'received',
      estimatedTotal: payload.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }
  },
  async getById(orderId: string): Promise<Order> {
    await delay(800)
    return mockOrders.find(o => o.orderId === orderId) ?? mockOrders[0]
  },
}

// Cuando llegue el backend real, se swappea así:
// import { realOrderService as mockOrderService } from './realOrderService'
// El resto de la app no cambia.
```

### Gestión de estado de checkout

`checkoutStore` es un store efímero (no persistido). Se destruye al confirmar el pedido o al salir del flujo:

```typescript
interface CheckoutState {
  deliveryMode: 'pickup' | 'delivery' | null
  timeSlot: 'morning' | 'afternoon' | 'asap' | null // 3 bandas, no horas exactas
  address: string
  substitutionPref: 'call_me' | 'similar' | 'remove' | null
  customerName: string  // captura silenciosa en primer pedido
  isSubmitting: boolean
}
```

### Auth mock para la demo

No se implementa WhatsApp Magic Link real. En su lugar:

```typescript
// authStore — para el demo
const DEMO_USER: User = {
  id: 'demo-user-001',
  name: 'Carmen López',
  phone: '+57 315 000 0000',
}

// El usuario siempre aparece como "autenticado" en modo demo
// Al integrar el backend real, se reemplaza DEMO_USER por la sesión real del JWT
```

---

## 7. Datos del Catálogo para la Demo

### Requerimientos de los datos mock reales

Para que la demo sea convincente con usuarios de Dolores:

| Campo | Requerimiento |
|-------|--------------|
| Nombres | Nombres reales tal como aparecen en la tienda |
| Precios | Precios reales en COP (verificados con Leche y Miel) |
| Fotos | Fotos reales de los productos, tomadas en la tienda |
| Categorías | Los pasillos reales de Leche y Miel (pendiente confirmar con el aliado) |
| Cobertura | ~15 productos reales — suficiente para validar navegación y confianza sin sobrecargar la preparación |

### Formato de imagen para la demo

```
Formato: WebP
Dimensiones: 400×400px (cuadrado)
Peso máximo: 30KB por imagen
Ubicación: /public/mock-images/<categoria>/<producto-slug>.webp
```

### Categorías para la demo

**Pendiente confirmar con Leche y Miel** cuáles son sus pasillos reales. No asumir categorías — el catálogo de la tienda es la fuente de verdad. Las categorías actuales en `mockData.ts` son un placeholder hasta esa confirmación.

### Productos especiales necesarios (para cubrir edge cases de la UI)

- Al menos **1 producto `inStock: false`** (para validar el badge "Agotado" y que el botón `+` desaparece)
- `is_variable_weight` → **fuera del scope del demo** (ver sección 13)

---

## 8. Fuera del Scope del Demo → Funcionalidades Futuras

### Peso Variable (`is_variable_weight`)

**Decisión:** fuera del scope del demo y del F&F inicial.

**Motivo:** el catálogo real de Leche y Miel no incluye productos de precio variable por peso. La funcionalidad no tiene caso de uso validado con el aliado actual.

**Qué queda en el código:**
- El campo `is_variable_weight: boolean` se mantiene en el tipo `Product` — no se elimina del contrato de datos
- Todos los productos del demo tienen `is_variable_weight: false`
- El campo está preparado para activarse cuando un aliado futuro lo requiera

**Cómo se activa en el futuro (cuando haya un caso real):**
1. El aliado confirma que vende productos por peso (carnicería, quesería, verdulería)
2. Se habilita el badge en `CatalogPage` cuando `is_variable_weight === true`
3. Se activa el banner "Total Estimado" en el checkout
4. Se activa el texto educativo en la confirmación
5. Se activa el input de peso real en el panel admin
6. Se activa la comparación `estimado vs final` en el monitor de pedido

Toda la UX está definida en `ui-rules.md` (Secciones 3, 4, 5 y 6). No requiere rediseño, solo activación condicional.

---

## 9. Reglas de UX (No Negociables en el Demo)

Las siguientes reglas vienen de `ui-rules.md` y son invariables. El RFC no puede proponer cambios a estas reglas:

| Regla | Motivo |
|-------|--------|
| CTA principal: **"Pedir mi Mercado"** (nunca "Pagar", "Checkout", "Confirmar pedido") | La palabra "Pagar" genera fricción en usuarios no digitalizados |
| Pantalla de confirmación debe incluir **"Pagas en efectivo cuando llegue tu pedido"** | El modelo es contra entrega; si no está explícito el usuario no sabe cuándo ni cómo paga |
| Contraste mínimo 7:1 | Legibilidad bajo sol directo en exterior |
| Todas las acciones primarias en la mitad inferior de la pantalla | Zona del pulgar en dispositivos Android gama media |
| Skeleton screens en todos los estados de carga | Sin layout shift; usuarios con 3G perciben la app como rápida |
| No abreviar nombres de productos | "L.E. Past. 1L" no comunica; "Leche Entera Pasteurizada 1L" sí |
| El carrito flotante sólo aparece si `count ≥ 1` | Si está vacío, no distrae |
| `router.replace()` después de confirmar pedido | Previene volver al checkout con el carrito ya limpiado |
| Limpiar carrito **sólo** después de recibir 201 del servidor (o mock exitoso) | Nunca perder el carrito si la red falla |
| No usar "Favoritos" en MVP | Complejidad sin demanda validada |
| Selector de hora: 3 bandas (Mañana / Tarde / Lo antes posible) | No horas exactas — reduce fricción de decisión |

### Aviso de datos personales (Ley 1581 de 2012 — Colombia)

El checkout captura nombre y teléfono del usuario. La Ley 1581 exige consentimiento informado y explícito para recolectar datos personales.

**Requerimiento para el demo:** el checkout debe incluir un texto visible antes del CTA:

> *"Al pedir, autorizas a MAUI y a Leche y Miel usar tu nombre y teléfono para gestionar tu pedido."*

No es un modal ni un flujo de consentimiento complejo — una línea de texto pequeño encima del botón es suficiente para el demo y para el F&F. La política de privacidad completa es un requerimiento para producción, no para el demo.

---

## 10. Riesgos del Sprint DEMO

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Usuarios no reconocen los productos (fotos/nombres incorrectos) | Alta | Alto | Validar catálogo con el empleado de L&M antes de la sesión |
| Latencia del mock es muy baja → expectativas irreales sobre la app real | Media | Medio | Configurar delay 800–1200ms en todos los mocks |
| Admin demo no simula bien el flujo del empleado | Media | Alto | Hacer walkthrough del admin con el empleado antes de la sesión de validación |
| Doble submit en checkout (tap rápido) | Media | Alto | Deshabilitar el botón mientras `isSubmitting === true` |
| Pérdida de carrito al actualizar PWA | Baja | Alto | `clearIfStale()` sólo aplica si >30 días; `persist` en localStorage es robusto |
| Sesión de validación con usuarios equivocados (técnicos, no usuarios reales) | Media | Alto | Reclutar usuarios reales de Dolores o perfil similar |

---

## 11. Criterios de Completitud por Feature

### FEAT-DEMO-001: Catálogo Mock con Datos Reales

**Done cuando:**
- [ ] Los ~15 productos tienen foto, precio y nombre reales de Leche y Miel
- [ ] Las categorías corresponden a los pasillos reales de la tienda (confirmados con el aliado)
- [ ] Las imágenes pesan <30KB en WebP
- [ ] Un habitante de Dolores reconoce los productos al ver la app

### FEAT-DEMO-002: Checkout Completo (Mock)

**Done cuando:**
- [ ] El usuario puede completar los 4 steps sin error
- [ ] El botón dice "Pedir mi Mercado"
- [ ] El carrito se limpia sólo después de la confirmación exitosa del mock
- [ ] `router.replace()` previene navegar atrás al checkout
- [ ] El `checkoutStore` se destruye al salir del flujo

### FEAT-DEMO-003: Órdenes con Estados Simulados

**Done cuando:**
- [ ] La timeline muestra los 5 estados con colores correctos
- [ ] El estado actual está resaltado
- [ ] El botón de WhatsApp genera un mensaje prellenado correcto
- [ ] El simulador de progreso (para demos en vivo) avanza el estado cada 20s

### FEAT-DEMO-004: Admin Demo

**Done cuando:**
- [ ] El empleado puede ver el pedido generado en el cliente
- [ ] Puede avanzar el estado con un botón grande
- [ ] Cada transición genera un link de WhatsApp prellenado
- [ ] El diseño es usable en una tablet de 10"

### FEAT-DEMO-005: Deploy y Validación

**Done cuando:**
- [ ] La PWA está desplegada en URL pública accesible e instalable como PWA en Android e iOS
- [ ] Se realizó walkthrough previo del admin demo con el empleado de L&M (antes de la sesión con clientes)
- [ ] Se realizó la sesión de validación con 5 usuarios reales de Dolores siguiendo el protocolo del facilitador
- [ ] Al menos 4 de 5 usuarios responden "Sí" a "¿Lo usarías para tu próximo mercado?"
- [ ] El empleado procesó 3 pedidos sin indicación del facilitador
- [ ] El feedback está documentado en `tareas/demo-feedback.md`
- [ ] El Go/No-Go está registrado con decisión explícita y aprendizajes clave

**Protocolo del facilitador (sesión con clientes):**

El facilitador da una sola instrucción inicial: *"Imagina que vas a hacer el mercado de la semana. Usa la app como quieras."* Después no habla.

| Situación | Qué hace el facilitador |
|-----------|------------------------|
| El usuario se detiene y no sabe qué hacer | Esperar 30 segundos. Si sigue detenido, anotar el punto de fricción y preguntar: "¿Qué esperabas encontrar aquí?" — nunca indicar el siguiente paso |
| La URL no carga o la app falla | Reiniciar desde la URL. Anotar el incidente. No contar esa sesión como válida si el fallo bloqueó el flujo principal |
| El usuario pregunta si el pago es en efectivo | Responder "¿Qué dice la app?" — el aviso de pago en efectivo debe ser auto-explicativo |
| El usuario termina el flujo | Hacer tres preguntas: "¿Lo usarías?", "¿Se lo recomendarías a alguien?", "¿Qué cambiarías?" |

---

## 12. Decisiones de Arquitectura Pre-tomadas (No Abrir en el RFC)

Estas decisiones ya están validadas y no deben reabrirse en el RFC:

| Decisión | Razón |
|----------|-------|
| Zustand (no Redux, no Context API) | Suficiente para el tamaño de la app, menos boilerplate |
| React Query para fetching (no SWR, no fetch manual) | Cache, invalidación y estados de carga manejados; staleTime configurado |
| TailwindCSS (no CSS Modules, no Styled Components) | Velocidad de desarrollo, consistencia con design tokens |
| Mocks con la misma interfaz que el servicio real | Swapeo quirúrgico al llegar el backend — sin tocar componentes |
| Auth simulado en demo (no Magic Link real) | El flujo de auth es backend-dependent; el demo valida UX, no auth |
| 3 bandas de hora en checkout (no hour picker) | Análisis PM — reduce fricción de decisión; validado en backlog |
| `router.replace()` en confirmación | Previene bugs de back-navigation — regla de `ui-rules.md` |
| No WebSockets en demo (no en backend real hasta Sprint 4) | Polling 30s es suficiente para F&F; WebSocket añade complejidad sin beneficio validado |

---

## 13. Glosario del Dominio

| Término en código | Significado en el negocio |
|-------------------|---------------------------|
| `is_variable_weight` | Flag reservado para productos cuyo precio depende del peso real pesado en tienda. Fuera del scope del demo — todos los productos del demo tienen este campo en `false` |
| `inStock: false` | Producto agotado — se oculta el botón `+` y se muestra "Agotado" |
| `substitutionPref` | Qué hacer si un producto no está: llamar al cliente, reemplazar por similar, o descontar |
| `deliveryMode: 'pickup'` | El cliente recoge en la tienda en un slot de tiempo |
| `deliveryMode: 'delivery'` | El domiciliario lleva el pedido a la dirección del cliente |
| `timeSlot: 'asap'` | "Lo antes posible" — banda de horario para domicilio urgente |
| `price_at_moment` | Precio del producto en el momento en que se agregó al carrito (snapshot para consistencia) |
| `Pedir mi Mercado` | El CTA principal del checkout — nunca "Pagar" ni "Confirmar pedido" |
| F&F | Friends & Family — el primer grupo de ~30 usuarios reales de prueba en Dolores |
