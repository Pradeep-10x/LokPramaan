/**
 * WitnessLedger — Prisma client singleton
 * Re-uses a single PrismaClient instance across the application.
 * Prisma 7 uses driver adapters for direct database connections.
 */
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({
  connectionString,
  options: {
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  },
});

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
