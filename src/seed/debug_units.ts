import '../config/index.js';
import { prisma } from '../prisma/client.js';

async function main() {
  const units = await prisma.adminUnit.findMany({
    where: { name: { contains: 'Rajnagar', mode: 'insensitive' } },
  });
  console.log('Matching units:', JSON.stringify(units, null, 2));
}

main().finally(() => prisma.$disconnect());
