---
name: edit-orders
description: Edición inline de pedidos completos desde el panel admin
metadata:
  type: project
---

# Edición de pedidos — Diseño

## Resumen

El admin necesita poder editar cualquier pedido existente (en cualquier estado) directamente desde la tabla de pedidos en el panel admin. La edición se hace inline: al presionar "Editar" en una fila, esa fila se expande mostrando un formulario completo con todos los campos editables.

## Campos editables

- Datos del cliente: `clientName`, `clientPhone`, `clientAddress` (visible solo si `deliveryType === 'delivery'`)
- Tipo de entrega: `deliveryType` (`delivery` | `pickup`)
- Notas: `notes`
- Items del pedido: lista de productos con cantidad (`quantity`) y precio unitario (`unitPrice`). Se pueden agregar productos del menú, cambiar cantidades con +/− y eliminar items.
- `totalAmount` se recalcula automáticamente en frontend (live) y se reconfirma en backend al guardar.

## Backend

### Nuevo endpoint

```
PATCH /api/orders/:id
```

Body:
```json
{
  "clientName": "string",
  "clientPhone": "string",
  "clientAddress": "string | null",
  "deliveryType": "delivery | pickup",
  "notes": "string | null",
  "items": [
    { "productId": 1, "quantity": 2, "unitPrice": 15000 }
  ]
}
```

Lógica:
1. Valida que existan al menos 1 item y que `deliveryType` sea válido.
2. Dentro de una transacción Prisma: elimina todos los `OrderItem` del pedido y crea los nuevos.
3. Recalcula `totalAmount = sum(item.quantity * item.unitPrice)`.
4. Actualiza el `Order` con los nuevos campos y `totalAmount`.
5. Emite `order_updated` por socket.io con el pedido completo.
6. Devuelve el pedido actualizado con `items.product` y `delivery.driver` incluidos.

El endpoint existente `PATCH /api/orders/:id/status` no se modifica.

## Frontend

### Estado nuevo en `OrdersTab`

```js
const [editOrderId, setEditOrderId] = useState(null);   // id del pedido en edición
const [editForm, setEditForm]       = useState(null);   // datos del formulario
const [menuProducts, setMenuProducts] = useState([]);   // productos del menú para agregar items
```

`menuProducts` se carga una sola vez en el `useEffect` de montaje (junto con drivers).

### Comportamiento UX

- Al presionar "Editar" en una fila: se setea `editOrderId = o.id` y se inicializa `editForm` con los datos actuales del pedido. Si había otra fila abierta, se cierra (sin guardar).
- La fila expandida se renderiza como un `<tr>` adicional inmediatamente debajo de la fila del pedido, con `colSpan` igual al total de columnas de la tabla (8).
- Al presionar "Cancelar": `editOrderId = null`, `editForm = null`.
- Al presionar "Guardar": PATCH al endpoint, luego `fetchOrders()` y cierre del formulario.

### Formulario expandido — secciones

1. **Datos del cliente** (grid 2 columnas): nombre, teléfono
2. **Entrega**: select delivery/pickup + campo dirección (visible solo si delivery)
3. **Notas**: textarea
4. **Items**: lista de items actuales con controles −/+ y botón ×; selector de producto del menú + botón "Agregar ítem"
5. **Total calculado**: muestra `sum(qty * unitPrice)` en tiempo real
6. **Acciones**: botón "Guardar cambios" (BTN_PRIMARY) y "Cancelar" (BTN_OUTLINE)

### Ticket de impresión

`printTicket.js` no requiere cambios. Después de guardar la edición, el objeto `order` que llega del servidor ya contiene los datos actualizados (incluyendo `items.product`), por lo que el ticket impreso refleja el pedido editado correctamente.

## Restricciones

- No se puede guardar un pedido sin items.
- No se modifica el `orderNumber` ni el `status` desde este formulario.
- El `unitPrice` de los items existentes se mantiene del pedido original. Para nuevos items agregados, se usa el precio actual del producto (`product.price`).
