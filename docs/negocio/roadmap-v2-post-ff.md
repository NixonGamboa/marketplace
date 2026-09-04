# MAUI — Roadmap v2 (Post F&F)

**Cuándo activar:** Después de 50+ pedidos reales procesados exitosamente en F&F.
**Criterio de entrada:** El loop v1 funciona sin intervención del equipo técnico. La tienda opera el Admin de forma autónoma.

> Estas features no se eliminaron del producto — se pospusieron para reducir el riesgo en el F&F inicial. Cada una tiene un criterio de activación basado en evidencia real, no en el calendario.

> **Nota 2026-09-03:** Las menciones a "DynamoDB" y "AWS" en este documento reflejan el stack originalmente planeado. Para el arranque del backend real se adoptó Vercel Functions + Postgres (Neon) — ver `../tecnicos/adr-001-stack-backend.md`. Léanse como "backend real / BD administrada" hasta que se decida activar la migración a AWS.

---

## FEAT-007 v2: Auth Magic Link Completo

**Prioridad:** Alta — mejora retención y seguridad
**Activar cuando:** El Gateway de WhatsApp lleva 30+ días estable sin baneos

**Scope:**
- Backend: `POST /auth/request` — recibe `{ phone }`, genera JWT temporal (15min), envía link de acceso por WhatsApp
- Backend: `GET /auth/verify?token=XYZ` — valida token, retorna JWT de sesión (30 días), crea/actualiza usuario en DynamoDB
- Frontend: `AuthPage` actualizada — input teléfono → estado "Te enviamos el link por WhatsApp"
- Nueva ruta `/login?token=XYZ` → `LoginCallbackPage` → llama `/auth/verify` → redirect a `/`
- JWT guardado en localStorage (`maui-token`)
- `authStore.ts` completado: `login(phone)`, `verifyToken(token)`, `logout()`
- Auth guard: `/checkout` requiere auth → redirect a `/auth?redirect=/checkout`
- Migración de usuarios F&F: los usuarios que se registraron con nombre+teléfono en v1 se reconocen por número de teléfono

**Mensaje WhatsApp:**
`"¡Hola [nombre]! Toca aquí para entrar a MAUI: https://maui.com.co/login?token=XYZ — Válido por 15 minutos. Si no fuiste tú, ignora este mensaje."`

---

## FEAT-003b v2: Página de Búsqueda

**Prioridad:** Media
**Activar cuando:** El catálogo supere 60 productos activos O el feedback de usuarios indique que no encuentran productos

**Scope:**
- Ruta `/search?q=` con `SearchPage` component
- Búsqueda local sobre el catálogo en memoria (sin llamada al servidor por keystroke)
- Debounce 500ms, mínimo 2 caracteres
- Resultados en grid con los mismos `ProductCard`
- Empty state con ilustración + sugerencia de pasillos
- Integrar con `useUIStore.searchQuery` + `useNavigate` desde `Header`
- La barra de búsqueda del `Header` ya existe — solo conectar la navegación

---

## FEAT-004 v2: Product Detail Modal

**Prioridad:** Media
**Activar cuando:** Las fotos de producto de calidad estén disponibles en el catálogo real

**Scope:**
- Modal centrado al hacer click en `ProductCard`
- Imagen grande del producto (usa el srcset 800w para modal)
- Nombre completo (`name_legal`), precio, unidad, descripción si existe
- Badge de peso variable con explicación completa
- Botón "Agregar al carrito" con contador de cantidad (+/-)
- Cerrar con ESC, click fuera, o botón X
- Animación de entrada/salida (fade + scale)

---

## FEAT-010 v2: Order Tracker en PWA (con polling)

**Prioridad:** Media
**Activar cuando:** El feedback del F&F indique que los usuarios abren la app para ver el estado (el WhatsApp puede ser suficiente y nadie use el tracker)

**Scope:**
- Ruta `/pedido/:orderHash` — NanoID, no ID incremental (seguridad)
- Stepper de 5 estados: Recibido → Preparando → Listo/Pesado → En camino → Entregado
- Polling cada 30s (sin WebSocket — suficiente para el volumen esperado)
- Sin conexión: mostrar último estado conocido desde caché + aviso discreto
- Comparación de precios: `total_estimated` vs `total_final`; diferencia >10% → resaltar en naranja con explicación
- Botón "Hablar con la tienda" → WhatsApp prellenado con hash del pedido y estado actual
- Estado cancelado → alerta roja + botón de llamada directa
- Link desde `OrderConfirmationPage` → esta vista

---

## FEAT-012 v2: Fotos del Pedido en S3

**Prioridad:** Alta (la foto es clave para la confianza)
**Activar cuando:** FEAT-010 esté activo (el tracker es el contenedor de la foto)
**Reemplaza:** El envío manual de la foto por WhatsApp desde el Admin

**Scope:**
- Backend: `PUT /orders/:orderId/photo` → genera presigned URL de S3 para upload desde el Admin
- Upload desde Admin: el empleado toma foto con la tablet → selecciona archivo → upload directo a S3 via presigned URL → la URL se guarda en el pedido
- El Admin genera un thumbnail WebP (~50KB) automáticamente al recibir la imagen original
- Cliente: en el Order Tracker, cuando `status === 'ready'` → mostrar thumbnail de la foto
- Click en thumbnail → modal/lightbox con imagen completa + zoom
- Las fotos se sirven con presigned URLs temporales (1h) — nunca acceso público al bucket

---

## FEAT-003 v2: Time Slot Picker Refinado

**Prioridad:** Baja
**Activar cuando:** La demanda de pedidos genere necesidad de distribuir la carga horaria

**Scope:**
- Evolucionar las franjas horarias (Mañana/Tarde/Lo antes posible) a slots específicos
- Los slots disponibles se configuran desde el Admin (no hardcodeados)
- Si un slot está lleno (máximo de pedidos configurado), no aparece como opción
- El admin ve cuántos pedidos tiene por slot para organizar el picking

---

## FEAT-011 v2: "Mis Pedidos Anteriores" como Plantilla

**Prioridad:** Baja
**Activar cuando:** La tasa de pedidos repetidos sea >40% (usuarios que repiten el mismo mercado)

**Scope:**
- Sección en Home visible solo si el usuario está autenticado con al menos 1 pedido anterior
- Lista de los últimos 3 pedidos con fecha, # ítems y total
- Al tocar uno → carga los ítems en el carrito para edición manual (nunca automático)
- El usuario puede quitar o agregar productos antes de confirmar
- Badge indica ítems que ya no están disponibles (agotados o eliminados del catálogo)

---

## WebSockets / SSE para Order Tracker

**Prioridad:** Muy baja
**Activar cuando:** El volumen de pedidos simultáneos genere quejas sobre el polling siendo insuficiente

**Scope:**
- Evaluar: API Gateway WebSocket (AWS) vs Server-Sent Events
- Solo implementar si el polling cada 30s claramente no satisface la UX
- El canal primario de notificación sigue siendo WhatsApp — el tracker es un complemento

---

## Métricas para Decidir Activación

| Feature | Métrica de activación |
|---------|----------------------|
| Magic Link | Gateway estable 30+ días |
| Búsqueda | Catálogo >60 productos O feedback explícito |
| Product Detail Modal | Fotos de calidad disponibles en catálogo |
| Order Tracker PWA | Feedback: usuarios abren app para ver estado |
| Fotos en S3 | Order Tracker activo |
| Time Slot refinado | Demanda que requiere distribución de carga |
| "Mis Pedidos" | Tasa de pedidos repetidos >40% |
| WebSockets | Quejas concretas sobre polling en producción |
