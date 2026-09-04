# MAUI — Roadmap v3+ (Escala y SaaS)

**Cuándo activar:** Cuando MAUI tenga 2+ aliados activos y el modelo de negocio esté validado.
**Criterio de entrada:** El F&F en Dolores generó suficiente aprendizaje para construir un producto repetible en otros aliados.

> Estas features implican cambios arquitecturales significativos. No se construyen hasta tener claridad en el modelo de negocio y suficiente volumen para justificar la inversión.

> **Nota 2026-09-03:** Las referencias a "DynamoDB" y "AWS Lambda" en este documento reflejan el stack originalmente planeado. El stack inicial cambió a Vercel + Postgres (ver `../tecnicos/adr-001-stack-backend.md`). La migración a AWS + DynamoDB sigue siendo el destino esperado en la fase v3 (SaaS multi-aliado); las decisiones de este roadmap siguen siendo válidas conceptualmente, sólo cambia el *cuándo* se adopta ese stack.

---

## Módulo Financiero — Wallet de Prepago (SaaS)

**Por qué existe:** MAUI necesita un mecanismo de monetización automático cuando escale a múltiples aliados. El modelo manual (factura mensual) no escala.

**Arquitectura propuesta:**

### Wallet del Aliado
- Cada aliado tiene un balance de prepago en DynamoDB
- Tabla `Wallets`: `PK=storeId | balance, currency, lastRecharge, lastDebit`
- Recarga: el aliado transfiere a una cuenta de MAUI + confirma en el Admin (`POST /wallet/recharge`)

### Débito Automático por Pedido
- Al transicionar un pedido a `delivered` → Lambda calcula la comisión de MAUI (`ORDER.total_final × FEE_RATE`)
- `PATCH /orders/:orderId/status` llama internamente a `debitWallet(storeId, amount)`
- Si el débito falla (balance insuficiente) → el pedido igualmente queda como `delivered` pero se marca el adeudo

### Kill Switch Operativo
- Si `wallet.balance <= 0` → el backend cambia automáticamente `store.status = 'FORCE_CLOSED'`
- Los clientes ven el banner "La tienda no está disponible en este momento" (no el motivo real)
- La tienda recibe WhatsApp: "Su balance MAUI es $0. Recargue para recibir nuevos pedidos."
- Al registrar recarga con balance positivo → el estado se restaura automáticamente

### Auditoría
- Tabla `WalletTransactions`: cada débito y recarga con timestamp, monto, motivo, orderId
- El aliado puede ver el historial desde el Admin
- MAUI puede generar reportes mensuales por aliado

### Multas por incumplimiento (paridad de precios)
- Si una "compra fantasma" detecta desviación de precios > 5% → multa automática debitada del wallet
- Requiere proceso operativo externo de auditoría + un endpoint `POST /wallet/penalty`

---

## Multi-Aliado (SaaS Architecture)

**Cambios arquitecturales requeridos:**

### Tenant Isolation en DynamoDB
- Todas las tablas agregan `PK=storeId#{entityId}` o un GSI por `storeId`
- Las Lambdas reciben `storeId` del JWT del aliado y filtran automáticamente
- Los clientes de un aliado solo ven el catálogo de ese aliado

### Onboarding de Aliado
- Panel MAUI (interno, no del aliado): crear nuevo aliado con `storeId`, nombre, ciudad, comisión configurada
- Generar credenciales del Admin para el nuevo aliado
- Seed inicial del catálogo (o self-service via Admin-004)

### Dominio y Branding por Aliado
- Cada aliado puede tener su subdominio: `lecheymiel.maui.com.co`
- El manifest de la PWA carga el nombre y colores del aliado desde la API
- O bien: MAUI mantiene una sola PWA con el nombre MAUI y branding neutro

---

## Carrito Compartido / Pedido por Terceros

**Por qué existe:** En comunidades rurales colombianas, los hijos que viven en ciudades hacen el mercado para sus padres. Es un patrón cultural natural en Dolores.

**Scope:**
- El usuario puede especificar en el checkout: "Este pedido es para otra persona"
- Campo: nombre del destinatario + teléfono (para notificaciones WhatsApp al destinatario, no al que hace el pedido)
- Campo: dirección del destinatario
- El pedido se muestra en el historial del usuario que lo hizo
- Evaluar: ¿pago por transferencia previa? Requiere modelo de pago digital (no en MVP)

---

## Notificaciones Push del Admin a Clientes (Retención)

**Por qué existe:** El aliado puede enviar mensajes tipo "Tu producto favorito llegó" o "Oferta del día: leche a $2.500". Palanca de retención de alta efectividad en comunidades pequeñas.

**Scope:**
- El Admin tiene un panel "Notificaciones" con plantillas de mensajes
- Audiencia: todos los clientes activos en los últimos 30 días (con opt-in implícito al hacer el primer pedido)
- El envío usa el WhatsApp Gateway existente (broadcast)
- Límite: máximo 1 mensaje por semana por cliente para no generar spam
- Requiere: definir opt-out y cumplimiento con regulaciones colombianas de comunicaciones

---

## Devoluciones Sistematizadas (Logística Inversa)

**Por qué existe:** En el F&F se resuelven por WhatsApp. A escala, necesita trazabilidad y proceso formal.

**Scope:**
- El domiciliario puede marcar ítems como "Devuelto en puerta" desde una vista simplificada del Admin
- El sistema descuenta el valor del ítem del total antes de que el cliente entregue el efectivo
- El aliado ve el historial de devoluciones por motivo (calidad, error de picking, rechazo del cliente)
- Nota de crédito generada automáticamente en el wallet del aliado

---

## Sistema de Logística con Mototaxistas

**Por qué existe:** Para volúmenes mayores a 20 pedidos/día, el aliado no puede coordinar domicilios de forma manual por WhatsApp.

**Scope a definir:**
- Flota de confianza del aliado registrada en el sistema (no Uber-style, sino lista cerrada de confianza)
- El Admin asigna pedidos a un domiciliario específico
- El domiciliario recibe el pedido por WhatsApp con dirección y total a cobrar
- Al entregar: el domiciliario marca "Entregado" desde una vista simple (sin app propia — via link único enviado por WhatsApp)
- Arqueo de caja: el sistema muestra cuánto efectivo debe tener cada domiciliario al final del turno

---

## Contrato / SLA Formalizado

**Por qué existe:** Para escalar más allá de Leche y Miel, MAUI necesita un acuerdo legal que proteja tanto al aliado como a MAUI.

**Puntos clave del SLA (definir con asesoría legal):**
- Paridad de precios (MAUI = local físico)
- Infraestructura de picking mínima (2m² + báscula calibrada)
- Hardware mínimo (tablet Android 11+, 4GB RAM, SIM activa)
- SLA de picking: máximo 20 minutos
- Garantía de calidad (productos frescos no dañados)
- Barrido de agotados al inicio del turno
- Consecuencias de incumplimiento (multas debitadas del wallet)

---

## Métricas para Decidir Activación v3+

| Feature | Criterio de activación |
|---------|------------------------|
| Módulo financiero/Wallet | 2+ aliados activos O volumen >$1M COP/mes por aliado |
| Multi-Aliado | 2do aliado confirmado y con contrato |
| Carrito compartido | Feedback: usuarios mencionan hacer pedidos para otros |
| Notificaciones push | Tasa de retención <60% en usuarios que han hecho >1 pedido |
| Devoluciones sistematizadas | >5% de pedidos con algún problema de calidad |
| Sistema de logística | >20 pedidos/día en un aliado |
| SLA formalizado | Antes de firmar con el 2do aliado |
