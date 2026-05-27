import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { status, date } = req.query;
    const where = {};
    if (status) where.status = status;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.createdAt = { gte: start, lt: end };
    }
    const orders = await prisma.order.findMany({
      where,
      include: { items: { include: { product: true } }, delivery: { include: { driver: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: { include: { product: true } }, delivery: { include: { driver: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders
router.post('/', async (req, res) => {
  try {
    const { clientName, clientPhone, clientAddress, locationLat, locationLng, locationUrl, deliveryType, items, notes } = req.body;

    const totalAmount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    let order;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const orderNumber = await generateOrderNumber(attempt);
        order = await prisma.order.create({
          data: {
            orderNumber,
            clientName,
            clientPhone,
            clientAddress,
            locationLat,
            locationLng,
            locationUrl,
            deliveryType,
            status: 'pending',
            totalAmount,
            notes,
            items: {
              create: items.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
              })),
            },
            ...(deliveryType === 'delivery' && {
              delivery: { create: { estimatedMin: Number(process.env.ESTIMATED_DELIVERY_MINUTES) || 35 } },
            }),
          },
          include: { items: { include: { product: true } }, delivery: true },
        });
        break;
      } catch (err) {
        // P2002 = unique constraint violation en orderNumber, reintentar
        if (err.code === 'P2002' && attempt < 4) continue;
        throw err;
      }
    }

    const io = req.app.get('io');
    io.emit('new_order', order);

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/status
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

// DELETE /api/orders/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { status: 'cancelled' },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function generateOrderNumber(offset = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const count = await prisma.order.count({ where: { createdAt: { gte: today } } });
  return `ORD-${String(count + 1 + offset).padStart(3, '0')}`;
}

export default router;
