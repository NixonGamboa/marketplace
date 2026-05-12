# Proceso Operativo: Carga del Catálogo Real de Leche y Miel

**Responsable:** Equipo MAUI + equipo de Leche y Miel
**Cuándo:** Antes del lanzamiento F&F (completar en los Días 10-14 del roadmap)
**Objetivo:** Tener ~100 productos reales, con fotos y precios verificados, cargados en el Admin antes del primer pedido

---

## Paso 1 — Inventario de Productos a Digitalizar

Antes de fotografiar, acordar con el equipo de la tienda la lista completa de productos que van al catálogo digital.

**Criterios de inclusión:**
- Producto disponible de forma habitual (no de temporada o pedido especial)
- Precio estable (no varía diariamente)
- Se puede pesar o tiene unidad fija

**Categorías sugeridas para empezar:**
- Lácteos (leche, queso, yogurt, mantequilla)
- Abarrotes (arroz, aceite, azúcar, sal, pasta, granos)
- Frutas y Verduras (los de mayor rotación: tomate, papa, plátano, cebolla)
- Carnes (pollo entero, carne molida, costilla de res, hígado)
- Panadería (pan tajado, pan de queso, pandeyuca)
- Aseo (jabón de manos, detergente, suavizante, papel higiénico)
- Bebidas (gaseosas, jugos en caja, agua)

**Estimado:** 12-15 productos por categoría × 7 categorías = ~90-105 productos

---

## Paso 2 — Fotografía de Productos

### Equipo necesario
- Smartphone con cámara de ≥12MP (cualquier Samsung A-series moderno sirve)
- Superficie blanca o papel bond blanco para fondo
- Luz natural directa (junto a una ventana) — no usar flash

### Especificaciones de la foto
- **Fondo:** blanco puro o crema claro
- **Encuadre:** producto centrado, ocupa ~70% del frame
- **Sin sombras duras:** difuminar la luz con un papel delgado si es necesario
- **Ángulo:** frontal o ligeramente inclinado (45°)
- **Resolución mínima:** 1000×1000px (el sistema comprime a 400×400 WebP)
- **Formato de salida:** JPEG o PNG (el Admin convierte a WebP automáticamente)

### Lo que NO hacer
- No fotografiar sobre superficies de colores
- No dejar etiquetas de precio visibles del local físico
- No usar fotos de internet o de las marcas (riesgo legal y de calidad inconsistente)
- No cortar el producto con el borde del frame

### Sesión de fotografía estimada
- 100 productos × ~5 minutos cada uno (buscar, ubicar, fotografiar, verificar) = ~8 horas
- Recomendado: 2 sesiones de 4 horas en días distintos para no agotar al equipo
- Roles: 1 persona ubica y mueve los productos, 1 persona fotografía y verifica en pantalla

---

## Paso 3 — Información de Cada Producto

Para cada producto se necesita:

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Nombre display** (UI) | Nombre corto para la tarjeta — máximo ~25 caracteres | "Leche Entera Colanta" |
| **Nombre legal** (recibo) | Nombre completo como aparece en el inventario | "Leche Entera Pasteurizada Colanta 1L" |
| **Precio** | Precio de venta al público en COP — **idéntico al precio del local físico** | 3200 |
| **Unidad** | Unidad de venta | "1L", "500g", "unidad", "kg" |
| **Categoría** | Pasillo al que pertenece | "Lácteos" |
| **Peso variable** | ¿El precio final depende del peso exacto? | Sí (carnes, verduras) / No (productos empacados) |
| **Stock inicial** | ¿Está disponible al momento del lanzamiento? | Disponible / Agotado |

**Formato de entrega:** Hoja de cálculo (Google Sheets o Excel) con una fila por producto. El equipo técnico la usa para la carga masiva inicial.

---

## Paso 4 — Carga en el Admin

Una vez el Admin v1 esté disponible (Día 13-14 del roadmap), cargar los productos:

1. Abrir Admin en `admin.maui.com.co`
2. Ir a "Catálogo" → "Productos"
3. Para cada producto: "Crear producto" → llenar campos → subir foto → guardar
4. Verificar que la imagen aparezca correctamente y el precio sea el correcto

**Si el ADMIN-004 no está listo para el Día 14:** usar el seed script técnico con la hoja de cálculo. El equipo de desarrollo carga los productos via CLI. Las fotos se suben a S3 manualmente. Esta es la alternativa de emergencia — el Admin debe estar disponible lo antes posible.

---

## Paso 5 — Verificación de Paridad de Precios

**Antes del lanzamiento F&F**, hacer una auditoría rápida:

1. Un miembro del equipo va al local físico con la lista de productos
2. Verificar precio de cada producto físicamente vs el precio en el Admin
3. Cualquier diferencia → corregir en el Admin antes de abrir

**Frecuencia post-lanzamiento:** El equipo de Leche y Miel debe actualizar precios en el Admin cada vez que cambie un precio en el local físico. Esto es responsabilidad operativa del aliado.

---

## Paso 6 — Categorías e Íconos

Las 7 categorías ya están definidas en el código con iconos SVG pendientes (ver `tareas/design/assets-pendientes.md`).

Para el F&F, las categorías pueden operar con los fallbacks de Lucide icons que ya existen. Los íconos SVG personalizados son una mejora estética, no un bloqueador funcional.

---

## Checklist de Lanzamiento

- [ ] ~100 productos fotografiados y con información completa
- [ ] Todos los productos cargados en el Admin con fotos
- [ ] Precios verificados contra el local físico (100% de coincidencia)
- [ ] Productos de peso variable marcados correctamente
- [ ] Categorías configuradas y con nombres en español
- [ ] Al menos 1 producto por categoría con foto de calidad
- [ ] El catálogo se ve correctamente en la PWA del cliente (navegar pasillos, ver fotos)
- [ ] El administrador puede marcar un producto como "Agotado" y verificar que desaparece del catálogo del cliente
