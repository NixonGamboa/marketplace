# MAUI — ACUERDOS OPERATIVOS Y TÉCNICOS (BACKEND & ADMIN)

Este documento define los pilares de operación, la lógica de negocio y las restricciones técnicas innegociables para el núcleo de MAUI y el Socio Supermercado.

---

## 1. PANEL ADMINISTRATIVO

El panel no es un simple visor; es un sistema de control de calidad que bloquea errores operativos.

### A. Flujo de Pedido: De "Intención" a "Cierre"

* **Estado Inicial (Pendiente):** El pedido entra como una reserva de inventario. No se genera factura final ni se confirma el monto exacto al cliente.
* **Checklist Interactivo de Picking:** El sistema presenta los ítems en orden lógico (ej. por pasillos). El empleado debe marcar (check) cada producto físicamente. Técnicamente, esto actualiza el campo `status_picking` dentro del objeto JSONB del pedido. Bloqueo de finalización si faltan ítems.
* **Ajuste Dinámico de Pesos:** Para productos marcados como `variable_weight: true`, el sistema abre un input numérico al final del picking.
    * **Cálculo:** `Total_Final = Σ (Precio × Cantidad_Real)`
    * **Cierre de Pedido:** Solo tras el ajuste de pesos el pedido transiciona a "Listo para Despacho", disparando el ticket final al cliente vía WhatsApp.

### B. Gestión de Evidencia (Prueba de Vida)

* La cámara se activa obligatoriamente al final del picking.
* **Storage:** La imagen se procesa en el cliente (compresión WebP) y se sube a un bucket S3.
* **DB:** Se almacena únicamente la URL en el registro del pedido. Esta foto es el respaldo ante reclamos de "faltantes".

### C. Módulo Financiero — Billetera de Prepago (SaaS Model / "Cuentas Claras")

* **Wallet del Socio:** El socio debe mantener un balance positivo recargando saldo de forma anticipada.
* **Débito Automático:** Al transicionar un pedido a "Entregado", el sistema debita automáticamente el `%` de comisión del saldo del socio.
* **Kill Switch Operativo:** Si el saldo llega a `$0`, el backend cambia automáticamente el estado de la tienda a `FORCE_CLOSED`, ocultando el catálogo a los clientes hasta que se registre una nueva recarga.

### D. Funcionalidades de Operación

* **Alertas Invasivas:** Sonido de campana persistente para pedidos nuevos y modales de pantalla completa.
* **Botón de Pánico (Stock Fantasma):** Toggle rápido en el inventario para marcar productos como "Agotados" instantáneamente.

---

## 2. EXIGENCIAS AL SOCIO (SLA & OPERACIÓN)

Reglas innegociables para el éxito de la alianza. Si el socio falla en esto, la tecnología es irrelevante.

1. **Paridad de Precios:** Los precios en MAUI deben ser **idénticos** a los del local físico. No se permite inflar precios para cubrir la comisión. MAUI se reserva el derecho de realizar "compras fantasma" (Mystery Shopping) para auditar esto. El incumplimiento genera una multa automática debitada de la Billetera de Prepago.

2. **Infraestructura de Picking:** Espacio físico mínimo de **2m²** dedicado exclusivamente a pedidos digitales, con báscula digital calibrada (obligatoria para el ajuste de pesos) y suministros de empaque MAUI, alejados del flujo de clientes presenciales.

3. **Hardware & Conectividad:** Tablet/Smartphone exclusivo para MAUI con **Android 11+** (mínimo 4GB RAM), siempre conectado, volumen al máximo. Conexión Wi-Fi estable + backup de datos móviles (SIM activa) para evitar caídas por cortes de luz.

4. **SLA de Picking:** Ventana máxima de **15–20 minutos** para tener el pedido listo para despacho.

5. **Garantía de Calidad:** El socio asume el costo de reposición y nuevo envío si se despachan productos dañados o vencidos.

6. **Responsabilidad de Inventario:** El socio debe realizar un "barrido de agotados" en el Panel Admin al inicio de cada turno. Vender un producto inexistente por negligencia obliga al socio a cubrir el costo del domicilio de reposición.

---

## 3. DEFINICIONES PENDIENTES

Puntos críticos que requieren resolución inmediata.

### A. Protocolo de Devoluciones (Reverse Logistics)

* **Rechazo en Puerta:** Si el cliente rechaza un producto por calidad en el momento del "Pago contra entrega", el domiciliario debe marcar el ítem como "Devuelto" en una vista rápida de la app.
* **Nota de Crédito:** El sistema debe restar ese valor del total antes de que el cliente entregue el efectivo al domiciliario.

### B. Modelo Logístico Híbrido

* Selección y términos de negociación con la red de mototaxistas (flota de confianza con exclusividad por horas).

### C. Arqueo de Caja y Domicilios

* **Flujo de Efectivo:** Dado que el domiciliario recibe el 100% del dinero (Venta + Envío), definir si el arqueo se hace por cada viaje o al final del turno en caja central.
* **Comisión del Domiciliario:** Definir si MAUI retiene el costo del envío o si el supermercado le paga al transportista de forma independiente.

### D. Estrategia de Notificaciones (WhatsApp Gateway)

* **Instancia Dedicada:** Implementación de **Evolution API** en un VPS independiente para evitar bloqueos del número principal.
* **Fallback por Fallas:** Definir fallback (SMS o notificación Push) si la instancia de WhatsApp pierde conexión.

### E. Redacción de SLA / Contrato

* Documento legal que formalice todos los puntos anteriores con el dueño de "Leche y Miel".
