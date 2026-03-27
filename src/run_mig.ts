import 'dotenv/config';
import { prisma } from './prisma/client.js';

async function run() {
  try {
    // Add IssuePriority enum type
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "IssuePriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add priority column to Issue table
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "priority" "IssuePriority";
    `);

    // Add index on priority
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Issue_priority_idx" ON "Issue"("priority");
    `);

    console.log("Migration executed successfully!");
  } catch (error) {
    console.error("Migration error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
