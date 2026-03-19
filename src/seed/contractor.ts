import '../config/index.js'; // MUST BE FIRST to load .env
import { prisma } from '../prisma/client.js';
import { Role } from '../generated/prisma/client.js';
import bcrypt from 'bcrypt';

async function main() {
  // Find Rajnagar ward
  const rajnagar = await prisma.adminUnit.findFirst({
    where: { name: 'Rajnagar', type: 'WARD' },
  });

  if (!rajnagar) {
    console.error('Rajnagar ward not found');
    process.exit(1);
  }

  // Check if it already exists
  const existing = await prisma.user.findFirst({
    where: { email: 'rajnagar.contractor@example.com' }
  });

  if (existing) {
    console.log('Contractor already exists:', existing.email);
    return;
  }

  // Create contractor
  const passwordHash = await bcrypt.hash('password123', 10);
  const contractor = await prisma.user.create({
    data: {
      name: 'Rajnagar Contractor',
      email: 'rajnagar.contractor@example.com',
      passwordHash,
      role: Role.CONTRACTOR,
      adminUnitId: rajnagar.id,
      // Removed identityVerified if it doesn't exist on User model
    } as any, // Cast to any to avoid lint error if field missing, but let's be careful
  });

  console.log('Seeded Contractor in Rajnagar:', contractor.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
