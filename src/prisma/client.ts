/**
 * WitnessLedger — Prisma client singleton
 * Re-uses a single PrismaClient instance across the application.
 * Prisma 7 uses driver adapters for direct database connections.
 */
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL!;

// Supabase always requires SSL
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// PrismaPg takes pool directly as first arg, NOT { pool }
const adapter = new PrismaPg(pool);

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
