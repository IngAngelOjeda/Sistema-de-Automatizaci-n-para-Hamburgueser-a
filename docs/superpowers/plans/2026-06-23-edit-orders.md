# Edit Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar cualquier pedido existente (todos los campos) de forma inline desde el panel admin.

**Architecture:** Un nuevo endpoint `PATCH /api/orders/:id` en el backend maneja la edición completa usando una transacción Prisma. En el frontend, `OrdersTab` mantiene el estado de cuál fila está en edición y renderiza una `<tr>` expandible con un formulario inline debajo de la fila del pedido.

**Tech Stack:** Express.js + Prisma (backend), React + Vite (frontend), socket.io para sincronización en tiempo real.

## Global Constraints

- Respetar los estilos existentes: usar las constantes `INPUT`, `BTN_PRIMARY`, `BTN_OUTLINE`, `BTN_GREEN`, `BTN_DANGER_SM`, `BTN_YELLOW_SM` ya definidas en `Admin.jsx`.
- El `orderNumber` y el `status` NO se editan desde este formulario.
- El `unitPrice` de items existentes se mantiene del pedido original; los nuevos items agregados usan `product.price`.
- No se puede guardar un pedido sin al menos 1 item.
- Después de guardar, emitir `order_updated` por socket para sincronizar otros clientes.

---

### Task 1: Backend — endpoint PATCH /api/orders/:id

**Files:**
- Modify: `backend/src/routes/orders.js`

**Interfaces:**
- Produces: `PATCH /api/orders/:id` — acepta body `{ clientName, clientPhone, clientAddress, deliveryType, notes, items: [{ productId, quantity, unitPrice }] }`, devuelve el order completo con `items.product` y `delivery.driver`.

- [ ] **Step 1: Agregar el endpoint en `backend/src/routes/orders.js`**

Insertar después del endpoint `PATCH /api/orders/:id/status` (línea 118) y antes del `DELETE` (línea 121):

```js
// PATCH /api/orders/:id  (full edit)
router.patch('/:id', async (req, res) => {
  try {
    const { clientName, clientPhone, clientAddress, deliveryType, notes, items } = req.body;

    const validTypes = ['delivery', 'pickup'];
    if (!validTypes.includes(deliveryType)) return res.status(400).json({ error: 'Invalid deliveryType' });
    if (!items || items.length === 0) return res.status(400).json({ error: 'At least one item required' });

    const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    const order = await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: Number(req.params.id) } });
      return tx.order.update({
        where: { id: Number(req.params.id) },
        data: {
          clientName,
          clientPhone,
          clientAddress: clientAddress || null,
          deliveryType,
          notes: notes || null,
          totalAmount,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            })),
          },
        },
        include: { items: { include: { product: true } }, delivery: { include: { driver: true } } },
      });
    });

    const io = req.app.get('io');
    io.emit('order_updated', order);

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verificar que el servidor levanta sin errores**

```bash
cd backend && node src/index.js
```
Esperado: sin errores de sintaxis, el servidor escucha en el puerto configurado.

- [ ] **Step 3: Verificar el endpoint con curl**

```bash
curl -X PATCH http://localhost:3001/api/orders/1 \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "Test Edit",
    "clientPhone": "595981000000",
    "clientAddress": "Calle Test 123",
    "deliveryType": "delivery",
    "notes": "sin cebolla",
    "items": [{ "productId": 1, "quantity": 2, "unitPrice": 15000 }]
  }'
```
Esperado: respuesta 200 con el order actualizado, `totalAmount: 30000`, `items` con 1 elemento.

- [ ] **Step 4: Verificar validación — sin items**

```bash
curl -X PATCH http://localhost:3001/api/orders/1 \
  -H "Content-Type: application/json" \
  -d '{ "clientName": "X", "clientPhone": "Y", "deliveryType": "delivery", "items": [] }'
```
Esperado: `{ "error": "At least one item required" }` con status 400.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/orders.js
git commit -m "feat: add PATCH /api/orders/:id for full order editing"
```

---

### Task 2: Frontend — estado e integración en OrdersTab

**Files:**
- Modify: `frontend/src/pages/Admin.jsx`

**Interfaces:**
- Consumes: `PATCH /api/orders/:id` (Task 1), `GET /api/menu` (ya existe)
- Consumes: `menuProducts` state — array de `{ id, name, price, available, category }`

- [ ] **Step 1: Agregar estado de edición en `OrdersTab`**

En `OrdersTab` (línea 101), agregar los tres estados nuevos junto a los existentes:

```jsx
const [editOrderId, setEditOrderId] = useState(null);
const [editForm, setEditForm]       = useState(null);
const [menuProducts, setMenuProducts] = useState([]);
```

- [ ] **Step 2: Cargar menuProducts en el useEffect de montaje**

Reemplazar el `useEffect` que carga datos iniciales (actualmente líneas 111-114):

```jsx
useEffect(() => {
  fetchOrders();
  fetch('/api/delivery/drivers').then((r) => r.json()).then(setDrivers);
  fetch('/api/menu').then((r) => r.json()).then((data) => setMenuProducts(data.filter((p) => p.available)));
}, []);
```

- [ ] **Step 3: Agregar función `startEdit` y `saveEdit`**

Insertar después de `markDelivered` (actualmente línea 140):

```jsx
function startEdit(o) {
  setEditOrderId(o.id);
  setEditForm({
    clientName: o.clientName,
    clientPhone: o.clientPhone,
    clientAddress: o.clientAddress || '',
    deliveryType: o.deliveryType,
    notes: o.notes || '',
    items: o.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      name: i.product?.name || 'Producto',
    })),
    addProductId: '',
  });
}

function cancelEdit() {
  setEditOrderId(null);
  setEditForm(null);
}

async function saveEdit(orderId) {
  const { clientName, clientPhone, clientAddress, deliveryType, notes, items } = editForm;
  if (items.length === 0) { alert('El pedido debe tener al menos un producto.'); return; }
  await fetch(`/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientName,
      clientPhone,
      clientAddress: deliveryType === 'delivery' ? clientAddress : null,
      deliveryType,
      notes,
      items: items.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })),
    }),
  });
  cancelEdit();
  fetchOrders();
}
```

- [ ] **Step 4: Agregar el componente `EditOrderRow`**

Insertar antes de `return (` dentro de `OrdersTab`, después de `saveEdit`:

```jsx
function EditOrderRow({ orderId }) {
  if (editOrderId !== orderId) return null;

  const liveTotal = editForm.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  function setField(field, value) {
    setEditForm((f) => ({ ...f, [field]: value }));
  }

  function changeQty(idx, delta) {
    setEditForm((f) => {
      const items = f.items.map((item, i) =>
        i === idx ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
      );
      return { ...f, items };
    });
  }

  function removeItem(idx) {
    setEditForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  function addItem() {
    const product = menuProducts.find((p) => p.id === Number(editForm.addProductId));
    if (!product) return;
    setEditForm((f) => ({
      ...f,
      addProductId: '',
      items: [...f.items, { productId: product.id, quantity: 1, unitPrice: product.price, name: product.name }],
    }));
  }

  return (
    <tr className="bg-brand-card border-t border-brand-yellow/30">
      <td colSpan={8} className="px-4 py-4">
        <div className="space-y-4">

          {/* Datos del cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className={INPUT}
              placeholder="Nombre del cliente"
              value={editForm.clientName}
              onChange={(e) => setField('clientName', e.target.value)}
            />
            <input
              className={INPUT}
              placeholder="Teléfono"
              value={editForm.clientPhone}
              onChange={(e) => setField('clientPhone', e.target.value)}
            />
            <select
              className={INPUT}
              value={editForm.deliveryType}
              onChange={(e) => setField('deliveryType', e.target.value)}
            >
              <option value="delivery">🛵 Delivery</option>
              <option value="pickup">🏠 Retiro en local</option>
            </select>
            {editForm.deliveryType === 'delivery' && (
              <input
                className={INPUT}
                placeholder="Dirección"
                value={editForm.clientAddress}
                onChange={(e) => setField('clientAddress', e.target.value)}
              />
            )}
          </div>

          {/* Notas */}
          <textarea
            className={`${INPUT} w-full resize-none`}
            rows={2}
            placeholder="Notas (opcional)"
            value={editForm.notes}
            onChange={(e) => setField('notes', e.target.value)}
          />

          {/* Items */}
          <div className="space-y-2">
            {editForm.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 flex-wrap">
                <span className="text-sm flex-1 min-w-[120px]">{item.name}</span>
                <span className="text-xs text-brand-muted">
                  {SYMBOL}{item.unitPrice.toLocaleString('es-PY')}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => changeQty(idx, -1)}
                    className="w-6 h-6 rounded bg-brand-surface border border-brand-border text-sm font-bold hover:border-brand-yellow transition-colors"
                  >−</button>
                  <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(idx, 1)}
                    className="w-6 h-6 rounded bg-brand-surface border border-brand-border text-sm font-bold hover:border-brand-yellow transition-colors"
                  >+</button>
                </div>
                <span className="text-xs text-brand-yellow font-semibold w-20 text-right">
                  {SYMBOL}{(item.unitPrice * item.quantity).toLocaleString('es-PY')}
                </span>
                <button type="button" onClick={() => removeItem(idx)} className={BTN_DANGER_SM}>×</button>
              </div>
            ))}

            {/* Agregar producto */}
            <div className="flex gap-2 items-center flex-wrap pt-1">
              <select
                className={`${INPUT} flex-1 min-w-[180px]`}
                value={editForm.addProductId}
                onChange={(e) => setField('addProductId', e.target.value)}
              >
                <option value="">Agregar producto…</option>
                {menuProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {SYMBOL}{p.price.toLocaleString('es-PY')}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addItem}
                disabled={!editForm.addProductId}
                className={`${BTN_OUTLINE} disabled:opacity-40`}
              >
                Agregar
              </button>
            </div>
          </div>

          {/* Total + acciones */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-1 border-t border-brand-border">
            <span className="text-sm font-semibold text-brand-yellow">
              Total: {SYMBOL}{liveTotal.toLocaleString('es-PY')}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={cancelEdit} className={BTN_OUTLINE}>Cancelar</button>
              <button type="button" onClick={() => saveEdit(orderId)} className={BTN_PRIMARY}>
                Guardar cambios
              </button>
            </div>
          </div>

        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 5: Agregar botón "Editar" a los actions de cada sección**

En la sección **Nuevos pedidos** (pendingOrders.map), añadir el botón "Editar" en el `<div>` de actions, antes del botón de imprimir:

```jsx
<button onClick={() => startEdit(o)} className={BTN_YELLOW_SM}>Editar</button>
```

En la sección **En curso** (activeOrders.map), hacer lo mismo.

En la sección **Historial** (doneOrders.map), hacer lo mismo.

El `<div>` de actions en cada sección debe quedar así (ejemplo para pendingOrders):

```jsx
actions={
  <div className="flex gap-2 items-center">
    <button onClick={() => startEdit(o)} className={BTN_YELLOW_SM}>Editar</button>
    <span className="hidden md:inline">
      <button onClick={() => printTicket(o)} className={`${BTN_OUTLINE} text-xs px-3 py-1`}>Imprimir</button>
    </span>
    {o.deliveryType === 'delivery' && (
      <select
        className={`${INPUT} py-1 text-xs`}
        value={selectedDriver[o.id] || ''}
        onChange={(e) => setSelectedDriver((prev) => ({ ...prev, [o.id]: e.target.value }))}
      >
        <option value="">Repartidor…</option>
        {activeDrivers.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
    )}
    <button onClick={() => confirmAndAssign(o)} className={`${BTN_PRIMARY} text-xs px-3 py-1`}>
      {o.deliveryType === 'delivery' ? 'Confirmar y asignar' : 'Confirmar'}
    </button>
  </div>
}
```

Para activeOrders:
```jsx
actions={
  <div className="flex gap-2 items-center">
    <button onClick={() => startEdit(o)} className={BTN_YELLOW_SM}>Editar</button>
    <span className="hidden md:inline">
      <button onClick={() => printTicket(o)} className={`${BTN_OUTLINE} text-xs px-3 py-1`}>Imprimir</button>
    </span>
    {o.deliveryType === 'pickup' && o.status === 'assigned' ? (
      <button onClick={() => markDelivered(o.id)} className={BTN_GREEN}>Entregado en local</button>
    ) : null}
  </div>
}
```

Para doneOrders:
```jsx
actions={
  <div className="flex gap-2 items-center">
    <button onClick={() => startEdit(o)} className={BTN_YELLOW_SM}>Editar</button>
    <span className="hidden md:inline">
      <button onClick={() => printTicket(o)} className={`${BTN_OUTLINE} text-xs px-3 py-1`}>Imprimir</button>
    </span>
  </div>
}
```

- [ ] **Step 6: Renderizar `EditOrderRow` debajo de cada fila**

En `OrderRow`, el componente solo renderiza la `<tr>` del pedido. `EditOrderRow` se renderiza como una `<tr>` hermana, justo después. Esto requiere envolver ambas en un fragmento `<>`.

En los tres `.map()` de secciones, cambiar:
```jsx
<OrderRow key={o.id} o={o} actions={...} />
```
por:
```jsx
<React.Fragment key={o.id}>
  <OrderRow o={o} actions={...} />
  <EditOrderRow orderId={o.id} />
</React.Fragment>
```

Asegurate de agregar `import React from 'react'` si no está (Vite con JSX transform no lo requiere, pero el `React.Fragment` sí lo necesita — alternativamente usar `<>` no funciona en `.map()` sin key, así que usá `React.Fragment` con `key`).

Verificar el import en la línea 1 de `Admin.jsx`:
```jsx
import { useEffect, useState } from 'react';
```
Cambiarlo a:
```jsx
import React, { useEffect, useState } from 'react';
```

- [ ] **Step 7: Verificar en el navegador**

1. Abrir el panel admin en `http://localhost:5173/admin`
2. Hacer clic en "Editar" en cualquier pedido → la fila debe expandirse con el formulario
3. Modificar el nombre del cliente → guardar → verificar que la tabla se actualiza
4. Cambiar un item (cantidad +/-) → verificar que el total live se actualiza
5. Eliminar un item → verificar que desaparece
6. Agregar un producto del menú → verificar que aparece en la lista
7. Intentar guardar sin items → debe aparecer el alert
8. Hacer clic en "Imprimir" luego de editar → el ticket debe mostrar los datos actualizados
9. Abrir dos pedidos: al hacer clic en "Editar" de uno, el otro debe cerrarse

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Admin.jsx
git commit -m "feat: inline order editing in admin panel"
```
