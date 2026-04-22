# Guía de Entrenamiento: MAUI Admin para el Equipo de Leche y Miel

**Audiencia:** 1-2 empleados de Leche y Miel que operarán el panel Admin
**Duración estimada:** 2 horas (1h teoría práctica + 1h simulación de pedidos reales)
**Cuándo realizar:** Entre el Día 13-14 del roadmap, antes del lanzamiento F&F
**Prerequisito:** El Admin y el backend deben estar funcionando y con catálogo cargado

---

## Objetivo del Entrenamiento

Al finalizar, el empleado debe ser capaz de:
1. Ver un pedido nuevo sin que nadie se lo diga
2. Procesar el pedido de principio a fin (sin ayuda)
3. Actualizar el estado y notificar al cliente por WhatsApp
4. Marcar un producto como agotado si se termina en la tienda

---

## Parte 1 — Cómo Funciona MAUI (10 minutos)

**Explicar con el diagrama:**
```
Cliente pide en la PWA
        ↓
Pedido llega al Admin + WhatsApp del negocio
        ↓
Empleado procesa el pedido (picking)
        ↓
Empleado actualiza estado + notifica al cliente por WhatsApp
        ↓
Domiciliario entrega + cliente paga en efectivo
```

**Puntos clave para el empleado:**
- MAUI no reemplaza la atención al cliente presencial — es un canal adicional
- El cliente paga en efectivo al recibir — MAUI no maneja dinero
- Si hay algún problema, el cliente puede llamar al número de la tienda directamente
- Las notificaciones al cliente llegan por WhatsApp automáticamente cuando el empleado cambia el estado

---

## Parte 2 — Recepción de Pedidos (20 minutos)

### Cómo saber que llegó un pedido nuevo

1. El sistema envía un mensaje de WhatsApp al número del negocio con los detalles del pedido
2. El Admin también muestra el pedido en la lista con fondo naranja/amarillo y una alerta sonora

**Ejercicio:** El facilitador hace un pedido de prueba desde la PWA del cliente. El empleado debe identificarlo en el Admin en menos de 30 segundos.

### Qué hacer cuando llega un pedido

1. Abrir el Admin (bookmarkeado en el navegador de la tablet)
2. Ver la lista de pedidos — el nuevo aparece arriba con indicador de "Nuevo"
3. Tocar el pedido para ver el detalle

---

## Parte 3 — Procesar un Pedido (30 minutos)

### Vista de detalle del pedido

Mostrar y explicar cada sección:
- **Cliente:** nombre, teléfono (toca el teléfono para abrir WhatsApp directo), preferencia de sustitución
- **Dónde entregar:** dirección y referencia del cliente, o slot de recojo en tienda
- **Qué pidió:** lista de productos con cantidades y precios
- **Total estimado:** lo que el cliente espera pagar (puede variar si hay productos de peso variable)

### Cambiar el estado del pedido

**Estado 1 → "Preparando"**
- Tocar el botón `[Confirmar recepción]`
- El cliente recibe WhatsApp: "Ya recibimos su pedido y estamos preparándolo"
- Ahora el empleado va a recoger los productos de los estantes

**Ejercicio de picking:** Con la lista del pedido en el Admin, el empleado simula recoger los productos de la tienda y hace check mental de cada uno.

**Si un producto no está disponible:**
- Aplicar la preferencia de sustitución del cliente (que aparece en el detalle)
  - "Llamarme" → llamar al número del cliente para acordar qué hacer
  - "Producto similar" → buscar alternativa de marca/precio similar y anotarlo
  - "No enviar" → simplemente no incluirlo y el total se ajusta
- Si hay duda, llamar al cliente antes de continuar

### Productos de peso variable (carnes, verduras, frutas)

Estos productos tienen el ícono de báscula junto al nombre en el detalle del pedido.

1. Pesar el producto en la báscula
2. En el Admin, tocar el campo de peso del producto → ingresar el peso real (ej. `0.850`)
3. El sistema recalcula el precio automáticamente
4. **El botón "Listo para entrega" solo se activa cuando TODOS los pesos están ingresados**

**Ejercicio:** Simular pesaje con 2-3 productos. El empleado ingresa pesos y verifica que el total se actualiza.

**Estado 2 → "Listo para entrega"**
- Tocar el botón `[Listo para entrega]`
- El sistema revisa que todos los pesos estén ingresados (si no, bloquea)
- Tocar `[Enviar notificación al cliente]` → WhatsApp con el total final y los pesos reales
- Coordinar con el domiciliario para la entrega

**Estado 3 → "En camino"**
- Tocar el botón `[En camino]`
- El sistema envía WhatsApp automáticamente al cliente

**Estado 4 → "Entregado"**
- Cuando el domiciliario confirme que el cliente recibió y pagó
- Tocar el botón `[Entregado]`
- Listo — el pedido queda archivado

---

## Parte 4 — Situaciones Especiales (15 minutos)

### Si el cliente cancela o rechaza el pedido

Tocar `[Cancelar pedido]` → ingresar el motivo → el sistema notifica al cliente

### Si un producto se agota en la tienda

1. Ir a "Catálogo" en el menú
2. Buscar el producto
3. Tocar el toggle "Disponible/Agotado" → cambiar a Agotado
4. El producto desaparece del catálogo del cliente de inmediato

**Importante:** Hacer este barrido de agotados **al inicio de cada turno** para que el catálogo refleje la realidad de la tienda.

### Si el cliente llama preguntando por su pedido

1. Preguntarle su nombre o número de pedido
2. Buscarlo en la lista del Admin
3. Ver el estado actual y leer la información relevante al cliente

---

## Parte 5 — Simulación Completa (30 minutos)

Simular 3 pedidos completos de punta a punta:

**Pedido 1 — Pedido simple sin peso variable**
- El facilitador hace el pedido desde la PWA
- El empleado lo procesa completamente hasta "Entregado"
- Verificar que el cliente recibió todos los WhatsApp correctamente

**Pedido 2 — Pedido con carne y verduras (peso variable)**
- Incluir carne molida y tomates en el pedido
- El empleado ingresa pesos reales y verifica el recálculo del total

**Pedido 3 — Pedido con producto agotado**
- El facilitador pide un producto que el empleado marcará como "agotado" durante el pedido
- El empleado aplica la preferencia de sustitución del cliente

---

## Checklist de Evaluación (el empleado debe completar sin ayuda)

- [ ] Accede al Admin sin asistencia
- [ ] Identifica un pedido nuevo en menos de 30 segundos
- [ ] Lee correctamente: nombre del cliente, dirección, preferencia de sustitución
- [ ] Cambia estado a "Preparando" y el cliente recibe WhatsApp
- [ ] Ingresa pesos de productos variables correctamente
- [ ] Cambia estado a "Listo" con todos los pesos y el cliente recibe el total actualizado
- [ ] Cambia estado a "En camino" → el cliente recibe WhatsApp
- [ ] Cambia estado a "Entregado"
- [ ] Marca un producto como agotado y verifica que desaparece del catálogo

---

## Números de Soporte

En caso de problemas técnicos durante el F&F, contactar al equipo MAUI:

- **WhatsApp del equipo técnico:** [número a definir antes del lanzamiento]
- **Horario de soporte durante F&F:** 7am - 8pm todos los días
- **Para problemas urgentes:** llamada directa a [número a definir]

---

## Reglas de Oro

1. **Nunca dejar un pedido sin responder por más de 15 minutos** — si no puedes procesarlo de inmediato, cambia el estado a "Preparando" para que el cliente sepa que fue recibido
2. **Siempre ingresar los pesos reales antes de marcar "Listo"** — el cliente paga lo que el sistema indica
3. **Hacer el barrido de agotados al inicio del turno** — no vender lo que no hay
4. **Si tienes dudas sobre un pedido, llama al cliente** — es mejor preguntar que adivinar
5. **El número de WhatsApp del negocio es el canal de alertas** — mantenerlo activo y con notificaciones habilitadas
