import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';

const router = Router();
const prisma = new PrismaClient();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype));
  },
});

// GET /api/menu
router.get('/', async (_req, res) => {
  try {
    const products = await prisma.product.findMany({ orderBy: { category: 'asc' } });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/menu
router.post('/', async (req, res) => {
  try {
    const { name, description, price, category, imageUrl } = req.body;
    const product = await prisma.product.create({ data: { name, description, price, category, imageUrl } });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/menu/:id
router.patch('/:id', async (req, res) => {
  try {
    const { name, description, price, category, imageUrl } = req.body;
    const product = await prisma.product.update({
      where: { id: Number(req.params.id) },
      data: { name, description, price, category, imageUrl },
    });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/menu/:id/toggle
router.patch('/:id/toggle', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: Number(req.params.id) } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const updated = await prisma.product.update({
      where: { id: Number(req.params.id) },
      data: { available: !product.available },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/menu/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/menu/:id/image
router.post('/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagen no proporcionada o tipo inválido (jpeg/png/webp)' });
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const data = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    await prisma.productImage.upsert({
      where: { productId: id },
      update: { data, mimeType },
      create: { productId: id, data, mimeType },
    });

    const updated = await prisma.product.update({
      where: { id },
      data: { imageUrl: `/api/menu/${id}/image` },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/menu/:id/image
router.get('/:id/image', async (req, res) => {
  try {
    const image = await prisma.productImage.findUnique({
      where: { productId: Number(req.params.id) },
    });
    if (!image) return res.status(404).json({ error: 'Image not found' });

    const buffer = Buffer.from(image.data, 'base64');
    res.set('Content-Type', image.mimeType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/menu/:id/image
router.delete('/:id/image', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.productImage.delete({ where: { productId: id } });
    await prisma.product.update({ where: { id }, data: { imageUrl: null } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
