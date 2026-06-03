import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORY_LABELS = {
  hamburguesa: '🍔 Hamburguesas',
  lomito: '🥩 Lomitos',
  gaseosa: '🥤 Gaseosas',
  extra: '➕ Extras',
};

export async function getMenuText() {
  const products = await prisma.product.findMany({
    where: { available: true },
    orderBy: { category: 'asc' },
  });

  if (!products.length) return 'El menú no está disponible en este momento.';

  const byCategory = products.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  const symbol = process.env.CURRENCY_SYMBOL || '₲';
  let text = `📋 *Menú ${process.env.BUSINESS_NAME || 'Burger Casa'}*\n\n`;

  for (const [cat, items] of Object.entries(byCategory)) {
    text += `*${CATEGORY_LABELS[cat] || cat}*\n`;
    for (const item of items) {
      text += `• ${item.name} — ${symbol}${item.price.toLocaleString('es-PY')}`;
      if (item.description) text += ` _(${item.description})_`;
      text += '\n';
    }
    text += '\n';
  }

  return text.trim();
}

export async function getAvailableProducts() {
  return prisma.product.findMany({ where: { available: true } });
}
