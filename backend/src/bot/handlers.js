import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import { getMenuText, getAvailableProducts } from './menu.js';

const prisma = new PrismaClient();

// Estado de conversación por cliente: Map<phone, { state, data }>
const sessions = new Map();

// Timeout de inactividad: 10 minutos
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const timeouts = new Map();

const STATES = {
  IDLE: 'IDLE',
  MENU_SENT: 'MENU_SENT',
  CONFIRM_DELIVERY_TYPE: 'CONFIRM_DELIVERY_TYPE',
  WAITING_LOCATION: 'WAITING_LOCATION',
  ORDERING: 'ORDERING',
  CONFIRM_ORDER: 'CONFIRM_ORDER',
  DONE: 'DONE',
};

// Lista de contactos que NO son clientes (amigos, familia, staff interno)
// Agregar teléfonos para excluirlos del bot
const BLOCKED_NUMBERS = new Set([
  // Agregá tus números aquí si querés excluirlos:
  // '595981123456',
]);

function normalize(text) {
  return text.toLowerCase().trim();
}

function normalizePhone(phone) {
  return phone.replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '').replace(/@lid$/, '');
}

function isBlockedNumber(phone) {
  return BLOCKED_NUMBERS.has(normalizePhone(phone));
}

function getSession(phone) {
  return sessions.get(normalizePhone(phone)) || { state: STATES.IDLE, data: {} };
}

function setSession(phone, state, data = {}) {
  const key = normalizePhone(phone);
  sessions.set(key, { state, data });
  resetTimeout(key);
}

function clearSession(phone) {
  const key = normalizePhone(phone);
  sessions.delete(key);
  if (timeouts.has(key)) {
    clearTimeout(timeouts.get(key));
    timeouts.delete(key);
  }
}

function resetTimeout(phone) {
  const key = normalizePhone(phone);
  if (timeouts.has(key)) clearTimeout(timeouts.get(key));
  const t = setTimeout(() => {
    sessions.delete(key);
    timeouts.delete(key);
    console.log(`[Bot] Sesión expirada para ${key}`);
  }, SESSION_TIMEOUT_MS);
  timeouts.set(key, t);
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'BurgerBot/1.0' } }
    );
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

async function isRegisteredDriver(phone) {
  const normalized = normalizePhone(phone);
  const driver = await prisma.driver.findFirst({ where: { phone: normalized, active: true } });
  return driver || null;
}

async function getActiveOrderForDriver(phone) {
  const normalized = normalizePhone(phone);
  const driver = await prisma.driver.findFirst({ where: { phone: normalized } });
  if (!driver) return null;
  const delivery = await prisma.delivery.findFirst({
    where: { driverId: driver.id, order: { status: 'assigned' } },
    orderBy: { id: 'desc' },
    include: { order: true },
  });
  return delivery?.order || null;
}

async function notifyClientOrderOnTheWay(client, order) {
  const clientPhone = `${order.clientPhone}@s.whatsapp.net`;
  const msg =
    `🛵 *¡Tu pedido está en camino!*\n` +
    `Número de orden: *${order.orderNumber}*\n` +
    `Tiempo estimado: 15-20 minutos 🕐`;
  await client.sendText(clientPhone, msg);
}

function buildOrderSummary(session) {
  const { items, deliveryType, clientAddress, locationUrl } = session.data;
  const symbol = process.env.CURRENCY_SYMBOL || '₲';
  let total = 0;
  let itemLines = items.map((i) => {
    total += i.unitPrice * i.quantity;
    return `• ${i.quantity}x ${i.name} — ${symbol}${(i.unitPrice * i.quantity).toLocaleString('es-PY')}`;
  });

  let text = `📋 *Resumen de tu pedido:*\n${itemLines.join('\n')}\n`;
  if (deliveryType === 'delivery') {
    text += `\n📍 Dirección: ${clientAddress || locationUrl || 'Por coordenadas GPS'}`;
  }
  text += `\n\n💰 *Total: ${symbol}${total.toLocaleString('es-PY')}*\n\n¿Confirmás? Respondé *SÍ* para confirmar ✅`;
  return { text, total };
}

// Intenta parsear el pedido en texto libre contra los productos del menú
function parseOrderText(text, products) {
  const result = [];
  const lines = text.split(/[,\n]+/);

  for (const line of lines) {
    const clean = normalize(line).replace(/[^a-záéíóúüñ0-9 ]/g, ' ');
    // Buscar número al inicio
    const numMatch = clean.match(/^(\d+)\s+(.+)/) || clean.match(/^(.+)\s+x?\s*(\d+)$/);
    let qty = 1;
    let productText = clean;
    if (numMatch) {
      // "2 hamburguesa" o "hamburguesa x2"
      if (!isNaN(numMatch[1])) {
        qty = parseInt(numMatch[1]);
        productText = numMatch[2];
      } else {
        qty = parseInt(numMatch[2]);
        productText = numMatch[1];
      }
    }

    // Buscar producto por nombre aproximado
    const matched = products.find((p) =>
      normalize(p.name).includes(productText.trim()) ||
      productText.trim().includes(normalize(p.name).split(' ')[0])
    );
    if (matched) {
      result.push({ productId: matched.id, name: matched.name, quantity: qty, unitPrice: matched.price });
    }
  }
  return result;
}

export async function handleMessage(client, message, io) {
  console.log(`[Bot] RAW - from: ${message.from}, type: ${message.type}, body: "${message.body}"`);

  // Ignorar mensajes de grupos
  if (message.isGroupMsg) {
    console.log(`[Bot] ⛔ Es un grupo, ignorando`);
    return;
  }

  // Ignorar mensajes del propio bot
  if (message.fromMe) {
    console.log(`[Bot] ⛔ Es del bot, ignorando`);
    return;
  }

  // Ignorar broadcast lists reales (status@broadcast)
  if (message.from === 'status@broadcast') {
    console.log(`[Bot] ⛔ Es broadcast list, ignorando`);
    return;
  }

  // Ignorar mensajes sin texto (salvo ubicaciones GPS)
  if (message.type !== 'location' && (!message.body || !message.body.trim())) {
    console.log(`[Bot] ⛔ Mensaje vacío, ignorando`);
    return;
  }

  const phone = message.from;
  console.log(`[Bot] 1️⃣ Mensaje de ${phone}: "${message.body}"`);

  // Verificar si el número está bloqueado
  if (isBlockedNumber(phone)) {
    console.log(`[Bot] ⛔ Número bloqueado: ${phone}`);
    return;
  }

  console.log(`[Bot] 2️⃣ Pasó validaciones iniciales`);
  const body = normalize(message.body || '');

  // Detectar si es repartidor respondiendo "tomado"
  const driver = await isRegisteredDriver(phone);
  if (driver && body.includes('tomado')) {
    const order = await getActiveOrderForDriver(phone);
    if (order) {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'delivering' } });
      io.emit('order_updated', { ...order, status: 'delivering' });
      await notifyClientOrderOnTheWay(client, order);
      await client.sendText(phone, `✅ Perfecto ${driver.name}, ¡buen viaje! El cliente fue notificado.`);
    } else {
      await client.sendText(phone, `⚠️ No encontré un pedido listo para vos. Contactá al administrador.`);
    }
    return;
  }

  // Verificar si el cliente ya tiene un pedido activo (anti-spam)
  const activeOrder = await prisma.order.findFirst({
    where: {
      clientPhone: normalizePhone(phone),
      status: { in: ['pending', 'assigned', 'delivering'] },
    },
  });

  const session = getSession(phone);
  console.log(`[Bot] 3️⃣ Estado actual: ${session.state}`);

  // --- FLUJO DE ESTADOS ---

  if (session.state === STATES.IDLE || session.state === STATES.DONE) {
    console.log(`[Bot] 🔄 Estado IDLE - enviando bienvenida`);
    if (activeOrder) {
      await client.sendText(
        phone,
        `⏳ Ya tenés un pedido activo (*${activeOrder.orderNumber}*) en proceso. ¡Te avisamos cuando esté en camino!`
      );
      return;
    }
    const businessName = process.env.BUSINESS_NAME || 'Burger Casa';
    await client.sendText(
      phone,
      `¡Hola! 👋 Bienvenido a *${businessName}* 🍔\n¿Qué deseas hacer?\n\n1️⃣ Ver el menú\n2️⃣ Hacer un pedido`
    );
    setSession(phone, STATES.MENU_SENT, {});
    return;
  }

  if (session.state === STATES.MENU_SENT) {
    if (body.includes('1') || body.includes('menú') || body.includes('menu')) {
      const menuText = await getMenuText();
      await client.sendText(phone, menuText);
      await client.sendText(
        phone,
        `¿Querés hacer un pedido? Respondé *2* o *hacer pedido* 🍔`
      );
      return;
    }
    if (body.includes('2') || body.includes('pedido')) {
      await client.sendText(
        phone,
        `¡Genial! 🍔 ¿Cómo querés recibir tu pedido?\n\n1️⃣ Delivery 🛵 (te lo llevamos)\n2️⃣ Retiro en el local 🏠 (venís a buscarlo)`
      );
      setSession(phone, STATES.CONFIRM_DELIVERY_TYPE, {});
      return;
    }
    // Cualquier otro mensaje repite opciones
    await client.sendText(phone, `Respondé *1* para ver el menú o *2* para hacer un pedido.`);
    return;
  }

  if (session.state === STATES.CONFIRM_DELIVERY_TYPE) {
    if (body.includes('1') || body.includes('delivery')) {
      await client.sendText(
        phone,
        `Perfecto! Para que el repartidor llegue sin problemas, compartí tu ubicación 📍\n\n` +
        `👉 Tocá el clip 📎 → *Ubicación* → *Enviar ubicación actual*\n\n` +
        `Si no podés compartirla, escribí tu dirección completa (calle, número, barrio).`
      );
      setSession(phone, STATES.WAITING_LOCATION, { deliveryType: 'delivery' });
      return;
    }
    if (body.includes('2') || body.includes('retiro') || body.includes('local')) {
      await client.sendText(
        phone,
        `¡Perfecto! 📝 Escribí tu pedido:\nEjemplo: _"2 hamburguesas clásicas, 1 lomito, 2 Coca-Cola"_`
      );
      setSession(phone, STATES.ORDERING, { deliveryType: 'pickup' });
      return;
    }
    await client.sendText(phone, `Respondé *1* para delivery o *2* para retiro en el local.`);
    return;
  }

  if (session.state === STATES.WAITING_LOCATION) {
    let locationData = {};

    if (message.type === 'location') {
      // Ubicación GPS nativa de WhatsApp
      const { lat: latitude, lng: longitude } = message;
      const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
      const address = await reverseGeocode(latitude, longitude);
      locationData = {
        locationLat: latitude,
        locationLng: longitude,
        locationUrl: mapsUrl,
        clientAddress: address,
      };
      await client.sendText(phone, `📍 Ubicación recibida: ${address || mapsUrl}`);
    } else {
      // Dirección en texto
      locationData = { clientAddress: message.body.trim() };
      await client.sendText(phone, `📍 Dirección guardada: _${message.body.trim()}_`);
    }

    await client.sendText(
      phone,
      `📝 Ahora escribí tu pedido:\nEjemplo: _"2 hamburguesas clásicas, 1 lomito, 2 Coca-Cola"_`
    );
    setSession(phone, STATES.ORDERING, { ...session.data, ...locationData });
    return;
  }

  if (session.state === STATES.ORDERING) {
    const products = await getAvailableProducts();
    const items = parseOrderText(message.body, products);

    if (!items.length) {
      await client.sendText(
        phone,
        `❌ No pude entender tu pedido. Intentá escribirlo así:\n_"2 hamburguesas clásicas, 1 lomito, 2 Coca-Cola"_`
      );
      return;
    }

    const updatedSession = { ...session.data, items };
    const { text, total } = buildOrderSummary({ data: updatedSession });
    await client.sendText(phone, text);
    setSession(phone, STATES.CONFIRM_ORDER, { ...updatedSession, total });
    return;
  }

  if (session.state === STATES.CONFIRM_ORDER) {
    if (body.includes('si') || body.includes('sí') || body.includes('confirmo') || body.includes('ok')) {
      const { deliveryType, clientAddress, locationLat, locationLng, locationUrl, items, total } = session.data;

      const clientPhone = normalizePhone(phone);
      const clientName = message.sender?.pushname || message.sender?.name || clientPhone;

      const orderRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName,
          clientPhone,
          clientAddress,
          locationLat,
          locationLng,
          locationUrl,
          deliveryType,
          items,
          totalAmount: total,
        }),
      });

      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({}));
        console.error('[Bot] Error al crear pedido:', err);
        await client.sendText(phone, `❌ Hubo un error al procesar tu pedido. Por favor intentá de nuevo en unos minutos.`);
        clearSession(phone);
        return;
      }

      const order = await orderRes.json();
      const estimatedMin = Number(process.env.ESTIMATED_DELIVERY_MINUTES) || 35;

      await client.sendText(
        phone,
        `¡Tu pedido fue recibido! 🎉\n` +
        `Número de pedido: *${order.orderNumber}*\n` +
        `Tiempo estimado: ${estimatedMin}-${estimatedMin + 10} minutos ⏱️\n` +
        `Te avisamos cuando esté en camino 🛵`
      );

      setSession(phone, STATES.DONE, {});
      return;
    }

    if (body.includes('no') || body.includes('cancelar') || body.includes('cancel')) {
      await client.sendText(phone, `❌ Pedido cancelado. Escribí algo para empezar de nuevo.`);
      clearSession(phone);
      return;
    }

    await client.sendText(phone, `Respondé *SÍ* para confirmar o *NO* para cancelar.`);
    return;
  }
}
