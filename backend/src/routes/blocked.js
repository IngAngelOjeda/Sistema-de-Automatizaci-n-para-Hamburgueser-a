import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/blocked
router.get('/', async (req, res) => {
  try {
    const blocked = await prisma.blockedPhone.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(blocked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/blocked
router.post('/', async (req, res) => {
  try {
    const { phone, note } = req.body;
    if (!phone || !phone.trim()) return res.status(400).json({ error: 'phone requerido' });

    const existing = await prisma.blockedPhone.findUnique({ where: { phone: phone.trim() } });
    if (existing) return res.status(409).json({ error: 'Número ya bloqueado' });

    const blocked = await prisma.blockedPhone.create({
      data: { phone: phone.trim(), note: note?.trim() || null },
    });
    res.status(201).json(blocked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/blocked/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.blockedPhone.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
