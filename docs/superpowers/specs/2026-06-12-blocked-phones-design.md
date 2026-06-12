# Diseño: Bloqueo de números en el bot de WhatsApp

**Fecha:** 2026-06-12
**Alcance:** Backend (Prisma + nueva ruta API) + Bot (handlers.js) + Frontend (nueva pestaña admin)

## Contexto

El bot de WhatsApp recibe mensajes de cualquier número. Los repartidores registrados ya tienen un flujo especial ("tomado"), pero si mandan cualquier otro mensaje, entran al flujo de pedidos. Además, hay números (familia, staff) que tampoco deben poder pedir. Se necesita bloquear ambos casos silenciosamente.

## Decisiones tomadas

- **Repartidores:** bloqueados automáticamente — cualquier mensaje que no sea "tomado" se ignora sin respuesta
- **Lista manual:** almacenada en DB (modelo `BlockedPhone`), manejable desde el panel admin
- **Comportamiento:** silencio total — sin mensaje de respuesta al número bloqueado
- **BLOCKED_NUMBERS hardcodeado:** se mantiene tal cual, los dos mecanismos coexisten

## Modelo de datos

```prisma
model BlockedPhone {
  id        Int      @id @default(autoincrement())
  phone     String   @unique  // número normalizado, ej: 595981123456
  note      String?           // motivo opcional, ej: "repartidor Juan"
  createdAt DateTime @default(now())
}
```

## Archivos

### Nuevo: `backend/src/routes/blocked.js`

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/api/blocked` | — | Array de BlockedPhone |
| POST | `/api/blocked` | `{ phone, note? }` | BlockedPhone creado |
| DELETE | `/api/blocked/:id` | — | `{ ok: true }` |

Validación en POST: `phone` requerido, no vacío. Si ya existe devuelve 409.

### Modificado: `backend/src/index.js`

Registrar el nuevo router: `app.use('/api/blocked', blockedRouter)`.

### Modificado: `backend/src/bot/handlers.js`

**Cambio 1** — auto-bloqueo de repartidores (extender bloque existente):

```javascript
const driver = await isRegisteredDriver(phone);
if (driver) {
  if (body.includes('tomado')) {
    // lógica existente sin cambios
  }
  return; // silencio para cualquier otro mensaje del driver
}
```

**Cambio 2** — nueva función y check después del BLOCKED_NUMBERS hardcodeado:

```javascript
async function isBlockedPhone(phone) {
  const blocked = await prisma.blockedPhone.findUnique({
    where: { phone }
  });
  return !!blocked;
}

// En handleMessage, después del check de BLOCKED_NUMBERS:
if (await isBlockedPhone(normalizePhone(phone))) return;
```

### Modificado: `backend/src/prisma/schema.prisma`

Agregar modelo `BlockedPhone`.

### Modificado: `frontend/src/pages/Admin.jsx`

- Agregar `'Bloqueados'` al array `TABS`
- Agregar componente `BlockedTab` siguiendo el mismo patrón que `DriversTab`:
  - Formulario: input `phone` (requerido) + input `note` (opcional) + botón "Bloquear"
  - Lista: phone | note | fecha | botón "Desbloquear" (`BTN_DANGER_SM`)
- Renderizar `{tab === 5 && <BlockedTab />}` en el Admin principal

## Flujo del bot (actualizado)

```
mensaje recibido
  → es grupo / fromMe / broadcast / vacío → ignorar
  → BLOCKED_NUMBERS hardcodeado → ignorar
  → isBlockedPhone(DB) → ignorar
  → isRegisteredDriver → si driver:
      → dijo "tomado" → flujo de tomado
      → cualquier otro → ignorar (silencio)
  → flujo normal de pedidos
```

## Fuera de alcance

- Notificar al admin cuando un número bloqueado intenta escribir
- Bloqueo temporario con fecha de expiración
- Importar lista de bloqueados masivamente
