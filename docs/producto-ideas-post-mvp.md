## Lista de ideas que se pueden mejorar SOLO despues de tener el MVP 100% funcional.

### Oportunidades de Producto

- **Carrito Compartido / Pedido por Otros**
  Por qué: En Dolores hay mucha población adulta mayor que no usa apps, pero tiene hijos/nietos en otras ciudades o en el mismo pueblo.
  Feature: Permitir que alguien haga el mercado desde su celular y lo mande a la dirección de sus padres, con la opción de que el hijo pague (vía transferencia) o el padre reciba.

- **Notificaciones Push desde el Panel Admin (retención)**
  Por qué: El admin puede enviar mensajes tipo "Tu producto favorito llegó" o "Oferta del día: leche a $2.500". Esta palanca de retención aumenta dramáticamente la recurrencia sin añadir complejidad al cliente.
  Feature: Panel Admin con botón "Enviar notificación a clientes activos" vía WhatsApp broadcast.

- **Estado de Tienda dinámico desde API**
  Por qué: Actualmente el horario está quemado en config estática. Si el aliado cierra un día feriado o cambia el horario temporalmente, no hay forma de reflejarlo sin un deploy.
  Feature: Endpoint `GET /store/status` gestionado desde el Panel Admin. El frontend lo consulta al abrir la app (stale-while-revalidate) y el banner de estado refleja el valor real.

### TODOs Técnicos Pendientes de Decisión

- **[TODO] Realtime para el Monitor de Pedido**
  Estado: Por definir antes de FEAT-010.
  Contexto: El MVP debe notificar al cliente cuando el estado del pedido cambia (Preparando → Listo → En camino). La restricción es costo mínimo en AWS. El canal primario ya es WhatsApp — evaluar si la notificación por WhatsApp es suficiente y el monitor solo hace polling pasivo, o si se necesita WebSocket real. La arquitectura AWS debe ajustarse a la necesidad, no al revés. Opciones a evaluar: (1) Solo WhatsApp push desde Lambda + polling simple 30s en el cliente, (2) API Gateway WebSocket (pay-per-message, muy bajo costo en volumen MVP), (3) DynamoDB Streams + Lambda + SSE (Server-Sent Events).

- **[TODO] "Mis Pedidos Anteriores" como plantilla de carrito**
  Estado: FEAT-011 deshabilitada en MVP.
  Contexto: La funcionalidad "Lo de siempre" está deshabilitada en el MVP por riesgo de pedidos accidentales. La versión correcta es: el usuario ve la lista de pedidos anteriores y elige uno como plantilla. El carrito se carga con esos items para edición, nunca de forma automática. Implementar después de FEAT-010 cuando el historial de pedidos esté disponible.

