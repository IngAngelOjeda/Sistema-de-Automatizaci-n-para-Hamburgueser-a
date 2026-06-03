import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const products = [
  { name: 'Hamburguesa Clásica', description: 'Carne, lechuga, tomate, queso', price: 35000, category: 'hamburguesa' },
  { name: 'Hamburguesa Doble', description: 'Doble carne, doble queso, cebolla caramelizada', price: 50000, category: 'hamburguesa' },
  { name: 'Hamburguesa BBQ', description: 'Carne, bacon, queso cheddar, salsa BBQ', price: 45000, category: 'hamburguesa' },
  { name: 'Hamburguesa Pollo', description: 'Pechuga de pollo rebozada, mayonesa, lechuga', price: 38000, category: 'hamburguesa' },
  { name: 'Lomito Clásico', description: 'Lomo fino, huevo, jamón, queso', price: 42000, category: 'lomito' },
  { name: 'Lomito Completo', description: 'Lomo fino, huevo, jamón, queso, bacon, tomate', price: 55000, category: 'lomito' },
  { name: 'Coca-Cola 500ml', description: null, price: 8000, category: 'gaseosa' },
  { name: 'Pepsi 500ml', description: null, price: 7000, category: 'gaseosa' },
  { name: 'Agua Mineral', description: null, price: 5000, category: 'gaseosa' },
  { name: 'Papas Fritas', description: 'Porción grande', price: 15000, category: 'extra' },
  { name: 'Papas Fritas Medianas', description: 'Porción mediana', price: 10000, category: 'extra' },
  { name: 'Aros de Cebolla', description: 'Porción', price: 12000, category: 'extra' },
];

async function main() {
  console.log('Seeding products...');
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: products.indexOf(p) + 1 },
      update: p,
      create: p,
    });
  }
  console.log(`✅ ${products.length} products seeded.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
