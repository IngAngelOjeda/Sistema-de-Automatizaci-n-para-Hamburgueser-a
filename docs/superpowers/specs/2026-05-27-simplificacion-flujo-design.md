# Simplificación de Flujo de Pedidos

**Fecha:** 2026-05-27  
**Estado:** Aprobado

## Contexto

El cliente reportó que el flujo interno tiene demasiados pasos. El panel de cocina genera fricción innecesaria: el cocinero debe confirmar, iniciar preparación y marcar como listo antes de que el repartidor reciba notificación. Se decide eliminar ese panel y concentrar toda la gestión en el Admin.

## Objetivo

Reducir el flujo de estados de 6 a 4, eliminar el panel de cocina, y permitir que el admin confirme y asigne repartidor en un solo click.

## Flujo de Estados

### Antes
```
pending → confirmed → preparing → ready → delivering → delivered
```

### Después
```
pending → assigned → delivering → delivered
```

Estados eliminados: `confirmed`, `preparing`, `ready`.

### Flujo por tipo de pedido

**Delivery:**
```
pending → assigned (admin asigna driver + WhatsApp automático) → delivering (driver responde "TOMADO") → delivered
```

**Pickup (retiro en local):**
```
pending → assigned (admin confirma) → delivered (admin marca cuando cliente retira)
```

## Cambios por Capa

### Backend

- **Estados válidos:** `pending`, `assigned`, `delivering`, `delivered`, `cancelled`
- **`PATCH /api/orders/:id/status`:** Sigue igual, solo acepta los nuevos estados válidos
- **`POST /api/delivery/:orderId/assign`:** Recibe `driverId` en el body, actualiza estado a `assigned` y dispara WhatsApp al repartidor en el mismo request. Si es pickup, `driverId` es opcional.
- **`handlers.js` (bot):** Lógica de "TOMADO" del repartidor actualiza estado de `assigned` a `delivering` (antes era de `ready`)

### Frontend — Admin.jsx

**Tab "Pedidos" — nueva estructura:**

- Sección "Nuevos pedidos": tarjetas con estado `pending`
  - Si es **delivery**: dropdown de repartidores activos + botón "Confirmar y asignar"
  - Si es **pickup**: botón "Confirmar pedido" (sin dropdown)
- Sección "En curso": tarjetas con estado `assigned` y `delivering`
  - Para pickup en estado `assigned`: botón "Entregado en local"
  - Resto: solo visualización

**Rutas eliminadas:** `/kitchen`, `/delivery`

### Frontend — Archivos eliminados

- `src/pages/Kitchen.jsx`
- `src/pages/Delivery.jsx`
- Links y rutas correspondientes en `App.jsx` y `Navbar.jsx`

## Sin Cambios

- Flujo del bot con el cliente (WhatsApp): sin modificaciones
- Notificación al repartidor por WhatsApp: sin modificaciones
- Lógica de round-robin para asignación automática: se reemplaza por selección manual del admin en el mismo paso de confirmación
- Socket.io: eventos `new_order` y `order_updated` siguen igual

## Criterios de Éxito

1. Admin puede confirmar un pedido de delivery y asignar repartidor en un solo click
2. El repartidor recibe WhatsApp automáticamente al ser asignado
3. Admin puede confirmar un pedido de pickup sin asignar repartidor
4. Los estados `confirmed`, `preparing`, `ready` no existen más en el sistema
5. El panel de cocina y delivery están eliminados sin romper el resto
