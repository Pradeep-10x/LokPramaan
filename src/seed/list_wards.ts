import '../config/index.js';
import { prisma } from '../prisma/client.js';

async function main() {
  const units = await prisma.adminUnit.findMany({
    where: { type: 'WARD' },
    select: { name: true }
  });
  console.log('Available Wards:', units.map(u => u.name));
}

main().finally(() => prisma.$disconnect());
