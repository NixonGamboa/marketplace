# MAUI — Reglas de Diseño por Vista

> Este archivo es la fuente de verdad para decisiones de UX/UI durante la implementación.
> Las imágenes de referencia (mockups, wireframes) están en `tareas/design/assets/`.
> Diseñar para la gente de Dolores: mercado rápido, bajo el sol, con señal inestable.

---

## Principios Globales

- **Contraste 7:1** en textos y botones. La app debe ser legible bajo el sol intenso de Dolores.
- **Zona del Pulgar:** todos los botones de acción primarios deben estar en la mitad inferior de la pantalla.
- **Skeleton Screens** en toda carga de imágenes o datos remotos. Prohibido el layout shift en conexiones 3G/4G inestables.
- **Sin "Favoritos":** esta funcionalidad queda fuera del MVP. El historial de pedidos cumple esa función.
- **Micro-copy local:** usar "Mi Canasta" (no Cart), "Pedir mi Mercado" (no Checkout/Pagar), "Pasillos" (no Categorías en UI).
- **Prohibido usar la palabra "Pagar"** en el CTA final — genera fricción innecesaria.

---

## Vistas

### 1. Auth — Acceso via WhatsApp ✅ APROBADA
> _Mockup: `assets/auth.png`_

- Foco único: número de celular + botón de acción. Sin formularios, sin contraseñas.
- Un solo input, un solo botón. Nada más en pantalla.
- Flujo: usuario ingresa número → recibe link por WhatsApp → toca el link → entra autenticado.
- El botón de acción usa copy directo: `"Entrar con WhatsApp"`.

---

### 2. Home — Mercado Rápido ✅ APROBADA
> _Mockup: `assets/home.png`_

#### Barra de Estado de la Tienda
- **Posición:** parte superior, visible antes del scroll.
- **Estados:** "Abierto" (verde) / "Cerrado" (rojo/gris) + horario de despacho del día.

#### Bloque "Reordenar"
- **Formato:** banner de una sola línea, full-width, debajo de la barra de estado.
- **Texto:** `"Reordenar mercado anterior"`
- **Acción:** carga el último pedido en el carrito para edición. **NO dispara un pago automático.**
- **Lógica de nuevo usuario:** si no hay pedidos previos, este banner se oculta completamente. El carrusel ocupa su espacio.
- **Prohibido:** cualquier mención a "1 clic" o confirmación automática.

#### Carrusel "Lo que no puede faltar"
- **Ubicación:** entre el bloque de reordenar y el grid de Pasillos.
- **Tarjetas:** compactas, precio en negrita, botón `+` grande y prominente (mínimo 44x44px, alto contraste).
- **Lógica:** solo productos con `inStock === true`. Si un producto se agota, desaparece del carrusel — no se muestra label "Agotado" aquí.
- **Copy sin abreviaciones:** nombres de producto completos siempre (`"Canasta Familiar"`, `"Arroz Anzo"`). No truncar con `...`.

#### Grid de Pasillos (Categorías)
- **Jerarquía:** protagonista visual de la pantalla tras el carrusel.
- **Comportamiento:** navegación pura. Ninguna tarjeta de categoría tiene botón `+`. Al tocar → navega al listado del pasillo.
- **Diseño:** iconos grandes, legibles bajo luz solar directa.

#### Barra de Búsqueda
- **Desktop:** centrada e integrada en el header como foco de acción principal.
- **Mobile:** margen inferior visible para separar del borde y evitar activación accidental de gestos del sistema.

#### Reglas Técnicas

**1. Prohibición de Layout Shift (CLS)**
- Todos los contenedores de imagen deben tener dimensiones fijas vía `aspect-ratio`.
- Mostrar Skeleton Loader hasta que el asset esté renderizado.

**2. Optimización de Assets**
- Ninguna imagen puede superar los **30 KB**. Formato obligatorio: **WebP**.
- Servir desde S3 con redimensionamiento dinámico según resolución del dispositivo.

**3. Caché Stale-While-Revalidate**
- El Home debe ser visible instantáneamente desde Cache Storage, incluso sin internet.
- La petición al backend ocurre en segundo plano sin bloquear la navegación.

**4. Optimistic UI en el Carrito**
- El botón `+` es instantáneo: el contador del header se actualiza de inmediato con animación sutil.
- Si la petición falla → revertir estado y mostrar aviso discreto.

**5. Stock Fantasma**
- `inStock === false` en listado: ocultar `+`, mostrar label gris `"Agotado"`.
- `inStock === false` en carrusel: eliminar el elemento de la vista por completo.

**6. Persistencia del Scroll**
- Al volver de un pasillo al Home, el usuario regresa al mismo punto. El scroll persiste en el router.

**7. Búsqueda Local**
- Búsqueda sobre el JSON del catálogo ya en memoria. Si requiere llamada al servidor: debounce mínimo **500ms**. Prohibido disparar peticiones por cada keystroke.

---

### 3. Catálogo — Listado de Productos
> _Mockup: `assets/catalogo.png`_

- **Tarjetas:** con Skeleton Loaders. Prohibido el layout shift.
- **Botón `+`:** ancho completo en la base del card. Grande, fácil de tocar con el pulgar.
- **Badge de Peso:** en productos frescos (carnes, verduras), mostrar alerta visible: `"Peso y precio final se ajustan en tienda"`.
- **Barra Flotante de Canasta:** resumen inferior persistente con total estimado y botón `"Ver mi Canasta"`. Visible en todo momento mientras se navega el catálogo.

---

#### Reglas Técnicas

**1. Skeleton Loaders (Blindaje CLS)**
- Obligatorio en cada tarjeta de producto. Sin spinners genéricos — el skeleton debe replicar la forma exacta del card: placeholder gris de imagen, líneas de texto y botón.
- Los contenedores deben tener `aspect-ratio` o `min-height` que reserve exactamente el espacio del card final antes de que cargue el dato.

**2. Flag `is_variable_weight`**
- El backend incluye `is_variable_weight: boolean` en cada producto.
- El frontend lee el flag y muestra el texto de advertencia `"Peso y precio final se ajustan en tienda"` **solo si `is_variable_weight === true`**.
- En productos de peso fijo (arroz, detergente, etc.) el aviso no aparece bajo ninguna circunstancia.

**3. Sinceridad de Producto — Nombres Reales**
- Prohibidos nombres ficticios o placeholder en producción (`"Banato"`, `"Leche Melke"`, etc.).
- El backend debe exigir catálogo real y completo. Si un nombre es largo, usar `name_display` (corto, UI) y `name_legal` (completo, legal/recibo). No truncar con `...`.

**4. Optimización de Imágenes**
- Formato obligatorio: **WebP**. Lazy loading en todas las imágenes del grid (solo cargan las que están cerca de la pantalla visible).
- Usar `srcset` o image resizer en S3 para servir resolución adecuada según el dispositivo. No cargar imagen de 1080p en pantalla de 720p.

**5. Barra Flotante de Canasta — Visibilidad Condicional**
- Si la canasta tiene **0 productos**: la barra no se renderiza. El catálogo usa toda la pantalla.
- Si la canasta tiene **≥1 producto**: la barra aparece con animación sutil desde abajo.
- El contenido del catálogo debe tener `padding-bottom` suficiente para no quedar tapado por la barra cuando está visible.

---

### 4. Cierre — Canasta + Checkout (Vista Fusionada)
> _Mockup: `assets/canasta-checkout.png`_

> Esta vista fusiona Canasta y Checkout en una sola pantalla. Es el paso más crítico del MVP.

- **Lista de items:** selectores `[-] 1 [+]` por producto. Claros y grandes.
- **Selector de Modalidad:** dos botones grandes y visibles: `"Recoger en Tienda"` vs `"Domicilio"`.
- **Módulo de Sustitución (mandatorio):** tres opciones visuales con iconos:
  1. `"Llamarme por teléfono"`
  2. `"Cambiar por similar (marca/precio)"`
  3. `"No enviar y descontar"`
  - **Bloquear avance** hasta que el usuario elija una opción. No es opcional.
- **Perfil Silencioso:** si es el primer pedido, solicitar solo `"Nombre"` en esta pantalla. No antes.
- **Botón Final:** `"Pedir mi Mercado"`. **Prohibida la palabra "Pagar".**

#### Reglas Técnicas

**1. Estado Reactivo del Carrito**
- Al usar `[-] 1 [+]`, el subtotal y el total se actualizan **instantáneamente** sin recarga.
- Si un item llega a 0, se elimina de `localStorage`/estado global y de la vista con transición suave.

**2. Identidad — Prohibido pedir lo que ya sabemos**
- El campo Teléfono se **pre-llena** con el número de la sesión de WhatsApp. No editable.
- El campo Nombre: si `user.profile.name` existe en DB → mostrar como texto estático `"Pedido para: [Nombre]"`. Si es `null` → campo obligatorio solo en este momento.
- **Lógica "Llamarme":** al elegir la opción de sustitución por llamada, mostrar checkbox `"¿Usar mi WhatsApp para la llamada?"` (marcado por defecto). Solo si lo desmarcan, habilitar input de número alternativo.

**3. Renderizado Condicional por Modalidad**
- **Domicilio:** mostrar input de dirección + botón "Usar mi ubicación" (Geolocation API). Sumar `delivery_fee` (desde config del aliado) al total de forma inmediata.
- **Recoger en tienda:** ocultar campos de dirección, mostrar selector de Slots de Hora (ej. `8:00 AM – 10:00 AM`). `delivery_fee = $0`.

**4. Bloqueo de Sustitución (Hard Block)**
- El botón `"Pedir mi Mercado"` permanece en estado `disabled` hasta que se elija una de las 3 opciones de sustitución.
- Al seleccionar una opción: aplicar estilo visual de confirmación (borde verde / sombra).

**5. Transparencia de Precios**
- Prohibido usar la etiqueta `"Total Final"`. Siempre usar `"Total Estimado"`.
- Si el carrito contiene algún producto con `is_variable_weight === true`, mostrar aviso obligatorio: `"El valor de carnes y verduras se ajusta según el peso exacto en tienda"`.

**6. Objeto del Pedido (POST atómico)**
- Al presionar el botón, enviar un único objeto JSON:
  ```json
  {
    "items": [{ "id": "...", "qty": 2, "price_at_moment": 3500 }],
    "substitutionPreference": "call | replace | remove",
    "delivery_type": "pickup | delivery",
    "delivery_data": {
      "address": "...",
      "lat": 0.0,
      "lng": 0.0,
      "time_slot": "8:00 AM – 10:00 AM"
    },
    "status": "pending"
  }
  ```
- `price_at_moment` captura el precio en el momento del pedido para evitar disputas si el precio cambia después.

---

### 5. Confirmación — Éxito y Educación
> _Mockup: `assets/success.png`_

- **Check de éxito visual:** grande, claro, satisfactorio.
- **Texto educativo:** `"Recibido. En Leche y Miel estamos pesando tus productos. Te enviaremos el total exacto por WhatsApp."`
- Gestionar expectativas: el usuario sabe que el total puede variar por productos frescos.
- **Botón:** `"Ir a mis pedidos"`.

#### Reglas Técnicas

**1. Destrucción del Carrito (Cart Sanitization)**
- Solo al recibir `201 Created` del backend → limpiar `localStorage` y el store Zustand de forma inmediata.
- Prohibido limpiar el carrito antes de la confirmación del servidor (podría ser un error de red).

**2. Idempotencia — Control del Botón Atrás**
- Navegar a esta vista usando `router.replace()`, **nunca** `router.push()`.
- Esto elimina la vista de Checkout del historial. Si el usuario presiona Atrás, cae en el Home — nunca en un formulario ya enviado.

**3. Persistencia de Referencia (Refresh-proof)**
- Al recibir la respuesta del servidor, guardar `order_id` y `estimated_total` en un estado de "Último Pedido" (localStorage o sessionStorage).
- Si el usuario recarga la página de éxito, los datos deben seguir visibles. No una pantalla en blanco.

**4. Deep Linking al Monitor**
- El botón `"Ir a mis pedidos"` apunta a `/order-tracker/[order_id]`.
- Si por alguna razón `order_id` no está disponible: redirigir al listado general `/orders`. **Nunca** a un 404.

**5. Fallback de Error — Esta Vista es Solo para Éxito**
- Si el `POST /orders` falla: mostrar Toast de error en el Checkout y **no navegar** a esta vista.
- Esta vista solo se renderiza con una confirmación exitosa del backend. Sin `order_id` válido, no existe.

**6. Notificaciones — Responsabilidad del Backend**
- El envío del mensaje de WhatsApp es responsabilidad del backend (vía Webhook o cola de mensajería), no del frontend.
- Garantiza que el mensaje llegue aunque el usuario cierre la app inmediatamente después de confirmar.
- Opcional: disparar evento de analítica (GA4) al cargar esta vista para trackear conversión.

---

### 6. Monitor de Pedido — Seguimiento & Foto
> _Mockup: `assets/order-tracker.png`_

- **Stepper de estados:** `Recibido ➔ Preparando ➔ Listo/Pesado ➔ En camino ➔ Entregado`. Cinco estados. Transición animada automática al cambiar estado.
- **Visor de Foto de Calidad:** thumbnail visible cuando el pedido está en estado "Preparando" o posterior. Click → Modal/Lightbox con imagen en alta resolución para zoom.
- **Botón de soporte:** WhatsApp con mensaje pre-llenado (ver Reglas Técnicas punto 5).
- **Ruta:** `maui.app/pedido/[order_hash]` — hash corto (NanoID), no ID incremental.

#### Reglas Técnicas

**1. Sincronización en Tiempo Real**
- El usuario no refresca para ver cambios. Usar **WebSockets** (Pusher o Supabase Realtime) o Long Polling cada 30–45s como fallback.
- Cuando el operario cambie el estado en el panel admin, el stepper del cliente transiciona automáticamente con animación.
- **Sin conexión:** mostrar el último estado conocido (desde caché) + aviso discreto `"Sin conexión — Mostrando última actualización"`. El usuario no debe pensar que el sistema se rompió.

**2. Foto de Calidad — Carga y Seguridad**
- El backend genera un **thumbnail WebP ~50 KB** para la carga inicial.
- Click en la foto → Modal/Lightbox con imagen en alta resolución + zoom.
- Las fotos en S3 se sirven con **URLs firmadas temporales** (presigned URLs). Solo el dueño del pedido puede acceder. Sin acceso público al bucket.

**3. Transparencia de Precios (Estimado vs. Real)**
- El componente de costos recibe dos objetos: `order_snapshot` (precios al pedir) y `final_tally` (precios tras el pesaje).
- Si la diferencia es **mayor al 10%**, resaltar el valor final en color de advertencia suave (naranja). Sin sorpresas al momento de pagar.

**4. Deep Linking — Ruta Compartible**
- Ruta: `/pedido/[order_hash]`. Usar NanoID o hash corto. **Prohibidos IDs incrementales** (`/pedido/1`) por seguridad.
- El enlace que llega por WhatsApp apunta a esta ruta. Si el usuario cierra la app y vuelve desde ese link, cae directo aquí.

**5. WhatsApp con Contexto Pre-llenado**
- El botón `"Hablar con la tienda"` abre WhatsApp con mensaje pre-llenado:
  `"Hola Leche y Miel, tengo una duda sobre mi pedido #[order_hash] en estado [estado_actual]"`
- Ahorra tiempo al operario y al cliente.

**6. Estado de Cancelación (Peor Caso)**
- Si el pedido es cancelado por el supermercado: la vista muta a estado de alerta roja con botón prominente para llamar directamente a la tienda.
- No dejar al usuario en una pantalla de "estado desconocido".
