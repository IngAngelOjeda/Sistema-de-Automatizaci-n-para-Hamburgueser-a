# Simplificación de Flujo de Pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir el flujo de estados de 6 a 4, eliminar paneles de Cocina y Delivery, y permitir que el admin confirme y asigne repartidor en un solo click desde el Panel Admin.

**Architecture:** El admin es el único operador del sistema interno. Al confirmar un pedido, el endpoint `POST /api/delivery/:orderId/assign` actualiza el estado a `assigned` y envía WhatsApp al repartidor en el mismo request. El cliente WhatsApp se comparte via `botState` para que las rutas puedan usarlo.

**Tech Stack:** Node.js + Express + Prisma + @whiskeysockets/baileys + React + Tailwind + Socket.io

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `backend/src/bot/state.js` | Modificar — agregar campo `client` |
| `backend/src/bot/index.js` | Modificar — asignar `botState.client` |
| `backend/src/routes/orders.js` | Modificar — estados válidos y status inicial |
| `backend/src/routes/delivery.js` | Modificar — assign hace todo en un solo paso |
| `backend/src/bot/handlers.js` | Modificar — queries de driver y anti-spam |
| `frontend/src/components/StatusBadge.jsx` | Modificar — nuevos estados |
| `frontend/src/App.jsx` | Modificar — eliminar rutas Kitchen/Delivery |
| `frontend/src/components/Navbar.jsx` | Modificar — eliminar links Kitchen/Delivery |
| `frontend/src/pages/Admin.jsx` | Modificar — reescribir OrdersTab |
| `frontend/src/pages/Kitchen.jsx` | Eliminar |
| `frontend/src/pages/Delivery.jsx` | Eliminar |

---

## Task 1: Backend — Exponer cliente WhatsApp en botState

**Files:**
- Modify: `backend/src/bot/state.js`
- Modify: `backend/src/bot/index.js`

- [ ] **Step 1: Agregar campo `client` a botState**

Reemplazar el contenido de `backend/src/bot/state.js`:

```javascript
export const botState = { status: 'disconnected', qr: null, client: null };
```

- [ ] **Step 2: Asignar el cliente en initBot**

En `backend/src/bot/index.js`, después de la línea `const client = { sendText: ... }` (línea 78), agregar:

```javascript
  botState.client = client;
```

El bloque completo debe quedar así (líneas 77-82):

```javascript
  const client = {
    sendText: (jid, text) => sock.sendMessage(jid, { text }),
  };

  botState.client = client;

  sock.ev.on('creds.update', saveCreds);
```

- [ ] **Step 3: Verificar que arranca sin errores**

```bash
cd backend && node --experimental-vm-modules src/index.js
```

Esperado: `Server running on port 3000` sin stack trace.

- [ ] **Step 4: Commit**

```bash
git add backend/src/bot/state.js backend/src/bot/index.js
git commit -m "feat: expose whatsapp client on botState for route access"
```

---

## Task 2: Backend — Actualizar estados válidos en orders.js

**Files:**
- Modify: `backend/src/routes/orders.js`

- [ ] **Step 1: Cambiar status inicial de la orden**

En `backend/src/routes/orders.js` línea 65, cambiar `status: 'confirmed'` por `status: 'pending'`:

```javascript
            status: 'pending',
```

- [ ] **Step 2: Actualizar array de estados válidos**

Línea 102, reemplazar:

```javascript
    const validStatuses = ['pending', 'assigned', 'delivering', 'delivered', 'cancelled'];
```

- [ ] **Step 3: Eliminar emit de order_ready**

Línea 113, eliminar la línea:

```javascript
    if (status === 'ready') io.emit('order_ready', order);
```

El bloque PATCH /status debe quedar así:

```javascript
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'assigned', 'delivering', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const order = await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { status },
      include: { items: { include: { product: true } }, delivery: { include: { driver: true } } },
    });

    const io = req.app.get('io');
    io.emit('order_updated', order);

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Verificar con curl**

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"clientName":"Test","clientPhone":"595981000000","deliveryType":"pickup","items":[{"productId":1,"quantity":1,"unitPrice":50000}]}'
```

Esperado: respuesta JSON con `"status": "pending"`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/orders.js
git commit -m "feat: orders now start as pending, remove obsolete statuses"
```

---

## Task 3: Backend — Endpoint assign completo (confirma + notifica repartidor)

**Files:**
- Modify: `backend/src/routes/delivery.js`

- [ ] **Step 1: Agregar import de botState**

En `backend/src/routes/delivery.js`, después de los imports existentes, agregar:

```javascript
import { botState } from '../bot/state.js';
```

El bloque de imports completo debe quedar:

```javascript
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { botState } from '../bot/state.js';

const router = Router();
const prisma = new PrismaClient();
```

- [ ] **Step 2: Reemplazar el endpoint GET /pending**

Cambiar el filtro de `ready` a `assigned` (línea 11):

```javascript
router.get('/pending', async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { status: 'assigned', deliveryType: 'delivery' },
      include: { items: { include: { product: true } }, delivery: { include: { driver: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Reemplazar el endpoint POST /:orderId/assign**

Reemplazar el endpoint completo (líneas 22-37) con:

```javascript
router.post('/:orderId/assign', async (req, res) => {
  try {
    const { driverId } = req.body;
    const orderId = Number(req.params.orderId);

    // Fetch order con items para armar mensaje al repartidor
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Upsert delivery record
    await prisma.delivery.upsert({
      where: { orderId },
      update: { driverId: driverId || null },
      create: { orderId, driverId: driverId || null },
    });

    // Actualizar estado de la orden a assigned
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'assigned' },
      include: { items: { include: { product: true } }, delivery: { include: { driver: true } } },
    });

    // Enviar WhatsApp al repartidor si se asignó uno
    if (driverId && botState.client) {
      const driver = await prisma.driver.findUnique({ where: { id: Number(driverId) } });
      if (driver) {
        const symbol = process.env.CURRENCY_SYMBOL || '₲';
        const itemLines = order.items.map((i) => `- ${i.quantity}x ${i.product.name}`).join('\n');
        const location = order.locationUrl
          ? `📍 Ubicación: ${order.locationUrl}`
          : `📍 Dirección: ${order.clientAddress || 'No especificada'}`;
        const msg =
          `🛵 *Nuevo pedido para entregar*\n\n` +
          `📋 Orden: ${order.orderNumber}\n` +
          `👤 Cliente: ${order.clientName}\n` +
          `📞 Teléfono: ${order.clientPhone}\n` +
          `${location}\n\n` +
          `🍔 Pedido:\n${itemLines}\n\n` +
          `💰 Total: ${symbol}${order.totalAmount.toLocaleString('es-PY')}\n\n` +
          `Respondé *TOMADO* cuando salgas a entregar.`;
        await botState.client.sendText(`${driver.phone}@s.whatsapp.net`, msg);
      }
    }

    const io = req.app.get('io');
    io.emit('order_updated', updatedOrder);

    res.json(updatedOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Verificar con curl (pickup sin repartidor)**

```bash
curl -X POST http://localhost:3000/api/delivery/1/assign \
  -H "Content-Type: application/json" \
  -d '{}'
```

Esperado: respuesta JSON con `"status": "assigned"`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/delivery.js
git commit -m "feat: assign endpoint now confirms order and notifies driver via WhatsApp"
```

---

## Task 4: Backend — Actualizar handlers.js del bot

**Files:**
- Modify: `backend/src/bot/handlers.js`

- [ ] **Step 1: Actualizar getActiveOrderForDriver**

Línea 97, cambiar `status: 'ready'` por `status: 'assigned'`:

```javascript
async function getActiveOrderForDriver(phone) {
  const normalized = normalizePhone(phone);
  const driver = await prisma.driver.findFirst({ where: { phone: normalized } });
  if (!driver) return null;
  const delivery = await prisma.delivery.findFirst({
    where: { driverId: driver.id, order: { status: 'assigned' } },
    include: { order: true },
  });
  return delivery?.order || null;
}
```

- [ ] **Step 2: Actualizar chequeo anti-spam**

Líneas 218-223, actualizar el array de estados activos para excluir los estados eliminados:

```javascript
  const activeOrder = await prisma.order.findFirst({
    where: {
      clientPhone: normalizePhone(phone),
      status: { in: ['pending', 'assigned', 'delivering'] },
    },
  });
```

- [ ] **Step 3: Verificar que el bot arranca**

```bash
cd backend && node src/index.js
```

Esperado: `Server running on port 3000` sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/bot/handlers.js
git commit -m "feat: update bot driver query and anti-spam to use new statuses"
```

---

## Task 5: Frontend — Eliminar paneles Kitchen y Delivery

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Navbar.jsx`
- Delete: `frontend/src/pages/Kitchen.jsx`
- Delete: `frontend/src/pages/Delivery.jsx`

- [ ] **Step 1: Reescribir App.jsx**

Reemplazar el contenido completo de `frontend/src/App.jsx`:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Reescribir Navbar.jsx**

Reemplazar el contenido completo de `frontend/src/components/Navbar.jsx`:

```jsx
import { NavLink } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="bg-orange-600 text-white shadow-md">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
        <span className="font-bold text-lg">🍔 Burger Casa</span>
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `px-4 py-2 rounded-lg font-medium transition ${
              isActive ? 'bg-white text-orange-600' : 'hover:bg-orange-500'
            }`
          }
        >
          ⚙️ Admin
        </NavLink>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Eliminar archivos**

```bash
del "frontend\src\pages\Kitchen.jsx"
del "frontend\src\pages\Delivery.jsx"
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Navbar.jsx
git rm frontend/src/pages/Kitchen.jsx frontend/src/pages/Delivery.jsx
git commit -m "feat: remove kitchen and delivery panels, redirect to admin"
```

---

## Task 6: Frontend — Actualizar StatusBadge

**Files:**
- Modify: `frontend/src/components/StatusBadge.jsx`

- [ ] **Step 1: Reemplazar STATUS_CONFIG**

Reemplazar el contenido completo de `frontend/src/components/StatusBadge.jsx`:

```jsx
const STATUS_CONFIG = {
  pending:    { label: 'Pendiente',   color: 'bg-yellow-100 text-yellow-800' },
  assigned:   { label: 'Confirmado',  color: 'bg-blue-100 text-blue-800' },
  delivering: { label: 'En camino',   color: 'bg-orange-100 text-orange-800' },
  delivered:  { label: 'Entregado',   color: 'bg-gray-100 text-gray-600' },
  cancelled:  { label: 'Cancelado',   color: 'bg-red-100 text-red-800' },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/StatusBadge.jsx
git commit -m "feat: update StatusBadge to reflect new order statuses"
```

---

## Task 7: Frontend — Reescribir OrdersTab en Admin.jsx

**Files:**
- Modify: `frontend/src/pages/Admin.jsx`

- [ ] **Step 1: Agregar import de socket.io-client**

Al inicio de `frontend/src/pages/Admin.jsx` ya existe `import { io } from 'socket.io-client';` — verificar que esté. Si no está, agregarlo después de los imports de React.

- [ ] **Step 2: Actualizar la constante TABS**

Línea 5, el array TABS no cambia (Pedidos sigue siendo tab 0). Verificar que sigue igual:

```jsx
const TABS = ['Pedidos', 'Menú', 'Repartidores', 'Estadísticas', 'WhatsApp'];
```

- [ ] **Step 3: Reemplazar la función OrdersTab completa**

Localizar desde `// ── Tab: Pedidos ──` hasta el cierre de `function OrdersTab()` (líneas 44-101) y reemplazar con:

```jsx
// ── Tab: Pedidos ──────────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState({});
  const [search, setSearch] = useState('');

  async function fetchOrders() {
    const data = await fetch('/api/orders').then((r) => r.json());
    setOrders(data);
  }

  useEffect(() => {
    fetchOrders();
    fetch('/api/delivery/drivers').then((r) => r.json()).then(setDrivers);
  }, []);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || '');
    socket.on('new_order', fetchOrders);
    socket.on('order_updated', fetchOrders);
    return () => socket.disconnect();
  }, []);

  async function confirmAndAssign(order) {
    const driverId = selectedDriver[order.id];
    if (order.deliveryType === 'delivery' && !driverId) {
      alert('Seleccioná un repartidor para el delivery');
      return;
    }
    await fetch(`/api/delivery/${order.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId: driverId ? Number(driverId) : null }),
    });
    fetchOrders();
  }

  async function markDelivered(orderId) {
    await fetch(`/api/delivery/${orderId}/delivered`, { method: 'PATCH' });
    fetchOrders();
  }

  const matchesSearch = (o) =>
    !search ||
    o.orderNumber.includes(search.toUpperCase()) ||
    o.clientName.toLowerCase().includes(search.toLowerCase());

  const pendingOrders = orders.filter((o) => o.status === 'pending' && matchesSearch(o));
  const activeOrders = orders.filter((o) => ['assigned', 'delivering'].includes(o.status) && matchesSearch(o));
  const doneOrders = orders.filter((o) => ['delivered', 'cancelled'].includes(o.status) && matchesSearch(o));
  const activeDrivers = drivers.filter((d) => d.active);

  function OrderRow({ o, actions }) {
    return (
      <tr key={o.id} className="border-t">
        <td className="px-4 py-3 font-mono font-semibold">{o.orderNumber}</td>
        <td className="px-4 py-3">{o.clientName}</td>
        <td className="px-4 py-3">{o.deliveryType === 'delivery' ? '🛵' : '🏠'}</td>
        <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
          {o.clientAddress || (o.locationUrl ? <a href={o.locationUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">Ver en Maps</a> : '–')}
        </td>
        <td className="px-4 py-3">{SYMBOL}{o.totalAmount?.toLocaleString('es-PY')}</td>
        <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
        <td className="px-4 py-3 text-gray-500 text-xs">{new Date(o.createdAt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</td>
        <td className="px-4 py-3">{actions}</td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      <input
        className="border rounded-lg px-3 py-2 text-sm w-64"
        placeholder="Buscar por número o cliente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Nuevos pedidos */}
      <section>
        <h2 className="font-semibold text-gray-700 mb-2">Nuevos pedidos ({pendingOrders.length})</h2>
        {pendingOrders.length === 0 ? (
          <p className="text-gray-400 text-sm">No hay pedidos pendientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm bg-white rounded-xl shadow">
              <thead className="bg-gray-50 text-left">
                <tr>
                  {['#', 'Cliente', 'Tipo', 'Dirección', 'Total', 'Estado', 'Hora', 'Acción'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map((o) => (
                  <OrderRow key={o.id} o={o} actions={
                    <div className="flex gap-2 items-center">
                      {o.deliveryType === 'delivery' && (
                        <select
                          className="border rounded px-2 py-1 text-xs"
                          value={selectedDriver[o.id] || ''}
                          onChange={(e) => setSelectedDriver((prev) => ({ ...prev, [o.id]: e.target.value }))}
                        >
                          <option value="">Repartidor…</option>
                          {activeDrivers.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => confirmAndAssign(o)}
                        className="bg-orange-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-orange-700 whitespace-nowrap"
                      >
                        {o.deliveryType === 'delivery' ? 'Confirmar y asignar' : 'Confirmar pedido'}
                      </button>
                    </div>
                  } />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* En curso */}
      <section>
        <h2 className="font-semibold text-gray-700 mb-2">En curso ({activeOrders.length})</h2>
        {activeOrders.length === 0 ? (
          <p className="text-gray-400 text-sm">No hay pedidos en curso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm bg-white rounded-xl shadow">
              <thead className="bg-gray-50 text-left">
                <tr>
                  {['#', 'Cliente', 'Tipo', 'Dirección', 'Total', 'Estado', 'Hora', 'Acción'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeOrders.map((o) => (
                  <OrderRow key={o.id} o={o} actions={
                    o.deliveryType === 'pickup' && o.status === 'assigned' ? (
                      <button
                        onClick={() => markDelivered(o.id)}
                        className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-green-700 whitespace-nowrap"
                      >
                        Entregado en local
                      </button>
                    ) : null
                  } />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Historial */}
      {doneOrders.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-700 mb-2">Historial ({doneOrders.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm bg-white rounded-xl shadow">
              <thead className="bg-gray-50 text-left">
                <tr>
                  {['#', 'Cliente', 'Tipo', 'Dirección', 'Total', 'Estado', 'Hora', 'Acción'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doneOrders.map((o) => (
                  <OrderRow key={o.id} o={o} actions={null} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Actualizar filtros en StatsTab**

En `StatsTab` (línea ~239), el fetch usa `/api/orders?date=...` — no cambia. Pero la línea que calcula `delivered` filtra por `o.status === 'delivered'`, que sigue siendo válido. No hay cambios necesarios.

- [ ] **Step 5: Verificar en el navegador**

Iniciar el frontend:
```bash
cd frontend && npm run dev
```

Abrir `http://localhost:5173`. Verificar:
- Redirige automáticamente a `/admin`
- Navbar solo muestra "Admin"
- Tab Pedidos muestra sección "Nuevos pedidos" y "En curso"
- Pedidos delivery muestran dropdown de repartidores
- Pedidos pickup muestran botón "Confirmar pedido"

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Admin.jsx
git commit -m "feat: rewrite admin orders tab with confirm+assign single action"
```

---

## Verificación final

- [ ] Crear un pedido de delivery via bot o curl → aparece en "Nuevos pedidos" con estado `pending`
- [ ] Admin selecciona repartidor y hace click en "Confirmar y asignar" → pedido pasa a "En curso", estado `assigned`, repartidor recibe WhatsApp
- [ ] Repartidor responde "TOMADO" → pedido cambia a `delivering` en tiempo real via Socket.io
- [ ] Crear un pedido de pickup → aparece sin dropdown, solo botón "Confirmar pedido"
- [ ] Admin confirma pickup → aparece en "En curso" con botón "Entregado en local"
- [ ] Admin hace click "Entregado en local" → pedido pasa a `delivered` y aparece en Historial
