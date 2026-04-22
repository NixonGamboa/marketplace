# 🛒 MAUI — BACKLOG DE PRODUCTO: APP CLIENTES (PWA)
**Versión:** 1.0 (MVP)
**Enfoque:** Alta adopción rural, Fricción Cero, Eficiencia Serverless.

---

## 🏗️ FASE 1: ACCESO Y AUTENTICACIÓN (EL FILTRO DE ENTRADA)

### 1.1 Autenticación via Magic Link (WhatsApp Gateway)
* **Descripción:** Inicio de sesión sin contraseñas ni códigos manuales de 6 dígitos.
* **Requerimiento Funcional:** * Input único para número de celular. 
    * El backend genera un token de sesión temporal y lo envía via WhatsApp (usando Evolution API / WPPConnect) en un enlace directo: `https://maui.app/login?token=XYZ`.
    * Al tocar el link, el usuario queda autenticado y es redirigido al Home.
* **Criterio de Éxito:** El usuario debe estar dentro de la app con un solo toque desde su chat de WhatsApp.

### 1.2 Persistencia de Sesión y Perfil Silencioso
* **Descripción:** No obligar al usuario a llenar formularios de registro antes de ver productos.
* **Requerimiento Funcional:**
    * Uso de JWT almacenado en **LocalStorage**.
    * El perfil (Nombre y Dirección) se solicita y guarda **solo al finalizar el primer pedido**.
    * Si el token expira, el sistema debe solicitar un nuevo Magic Link de forma transparente.

---

## 🛍️ FASE 2: CATÁLOGO Y DESCUBRIMIENTO (UX DE ALTO CONTRASTE)

### 2.1 Home de "Compra en 2 Clics"
* **Descripción:** Pantalla principal diseñada para la velocidad y usuarios recurrentes.
* **Requerimiento Funcional:**
    * **Botón "Lo de siempre":** Aparece solo si hay pedidos anteriores. Repite el último carrito con un toque.
    * **Navegación por Pasillos:** Grid de categorías con iconos grandes (Frutas, Aseo, Granos).
    * **Banner Operativo:** Estado de la tienda (Abierto/Cerrado) y horarios de despacho visibles.

### 2.2 Listado de Productos y Precios Dinámicos
* **Descripción:** Catálogo optimizado para carga rápida (imágenes WebP).
* **Requerimiento Funcional:**
    * **Etiqueta de Variabilidad:** Productos frescos (carne/verdura) DEBEN mostrar el texto: *"Precio final depende del peso exacto"*.
    * **Acción Directa:** Botón de `+` que añade al carrito e incrementa cantidad sin abrir modales.
    * **Offline-Friendly:** Cachear las imágenes de los productos para que sigan visibles si la señal de internet fluctúa.

---

## 🛒 FASE 3: GESTIÓN DE CANASTA (INTENCIÓN DE COMPRA)

### 3.1 Canasta Local (Resiliencia de Datos)
* **Descripción:** El carrito vive en el teléfono del usuario, no en el servidor (hasta el checkout).
* **Requerimiento Funcional:**
    * Persistencia en LocalStorage. Si el usuario cierra el navegador o se queda sin señal, la canasta NO se borra.
    * Validación de cambios de precio al momento de abrir la canasta.

---

## 💳 FASE 4: CHECKOUT Y LOGÍSTICA (EL CIERRE DE VENTA)

### 4.1 Selector de Modalidad (Dual)
* **Descripción:** Definir cómo se entrega el mercado.
* **Requerimiento Funcional:**
    * **Recoger en Tienda:** Obliga a elegir un "Slot de Hora" (Ej: 2:00 PM - 3:00 PM) para evitar aglomeraciones.
    * **Domicilio Urbano:** Campo de dirección y botón de "Usar mi ubicación actual" (GPS del navegador).

### 4.2 Lógica de Sustitución (Mandatorio)
* **Descripción:** Reglas claras para productos agotados.
* **Requerimiento Funcional:**
    * El usuario DEBE elegir una opción para poder finalizar: 
        1. "Llamarme por teléfono". 
        2. "Cambiar por similar (Marca/Precio)". 
        3. "No enviar y descontar".
* **Nota Técnica:** Esto elimina el 90% de las quejas post-venta.

### 4.3 Confirmación de Pedido (Pago Contra Entrega)
* **Descripción:** Finalización del proceso sin pasarelas de pago.
* **Requerimiento Funcional:**
    * Generar ID único.
    * Pantalla de éxito clara: *"Estamos pesando y empacando tu mercado. Te avisaremos el valor final exacto por WhatsApp"*.

---

## 🔔 FASE 5: POST-VENTA Y SEGUIMIENTO

### 5.1 Monitor de Estado y Foto de Calidad
* **Descripción:** Generar confianza visual.
* **Requerimiento Funcional:**
    * Línea de tiempo: *Recibido -> Empacando -> En Camino -> Entregado*.
    * **Visualización de Foto:** Cuando el pedido está "Listo", el cliente puede ver en la app la foto de su mercado empacado (tomada por el empleado de Leche y Miel).

### 5.2 Notificaciones via WhatsApp Gateway
* **Descripción:** Avisar cambios críticos sin que el usuario tenga que abrir la PWA.
* **Requerimiento Funcional:**
    * Envío de mensaje automático al cambiar estado a "Listo" o "En Camino".
    * Envío del total final ajustado (pesos) antes de que llegue el domiciliario.

---

## 🎨 ESPECIFICACIONES DE DISEÑO (EQUIPO UX/UI)

1.  **Thumb-Driven:** Todos los botones de acción (`+`, `Pagar`, `Confirmar`) en la mitad inferior de la pantalla.
2.  **Contraste 7:1:** Texto negro sobre fondo blanco o botones vibrantes. Dolores es soleado; la app debe verse bajo luz directa.
3.  **Skeleton Screens:** Usar placeholders grises mientras cargan las imágenes para reducir la ansiedad del usuario por conexiones lentas.
4.  **Micro-copy Local:** Usar "Mi Canasta" (no Cart), "Pedir mercado" (no Checkout), "Slots" (no Franjas).