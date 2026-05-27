import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { botState } from '../bot/state.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/delivery/pending
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

// POST /api/delivery/:orderId/assign
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
        try {
          await botState.client.sendText(`${driver.phone}@s.whatsapp.net`, msg);
        } catch (waErr) {
          console.error('[Delivery] Error enviando WhatsApp al repartidor:', waErr.message);
        }
      }
    }

    const io = req.app.get('io');
    io.emit('order_updated', updatedOrder);

    res.json(updatedOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/delivery/:orderId/delivered
router.patch('/:orderId/delivered', async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const [delivery, order] = await Promise.all([
      prisma.delivery.update({
        where: { orderId },
        data: { deliveredAt: new Date() },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { status: 'delivered' },
      }),
    ]);
    res.json({ delivery, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drivers
router.get('/drivers', async (_req, res) => {
  try {
    const drivers = await prisma.driver.findMany({ orderBy: { name: 'asc' } });
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drivers
router.post('/drivers', async (req, res) => {
  try {
    const { name, phone } = req.body;
    const driver = await prisma.driver.create({ data: { name, phone } });
    res.status(201).json(driver);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/drivers/:id/toggle
router.patch('/drivers/:id/toggle', async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { id: Number(req.params.id) } });
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    const updated = await prisma.driver.update({
      where: { id: Number(req.params.id) },
      data: { active: !driver.active },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
